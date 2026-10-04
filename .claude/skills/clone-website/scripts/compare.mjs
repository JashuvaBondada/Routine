#!/usr/bin/env node
// Visually compare a clone against a reference and report how far apart they are.
//
// Usage:
//   node compare.mjs <reference> <clone> [--width 1440] [--height 900] [--out diff-dir]
//
// <reference> and <clone> can each be:
//   - an http(s) URL
//   - a local directory or .html file (served over a throwaway local HTTP server so fonts/CORS behave)
//   - a .png screenshot (e.g. original-desktop.png written by capture.mjs)
//
// Writes reference.png, clone.png and diff.png (changed pixels in red) to --out and prints the
// mismatch percentage. Run it after every round of edits; aim for < 1-2 % on the desktop view.

import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require(path.join(process.env.NODE_PATH || '/opt/node22/lib/node_modules', 'playwright')));
}

const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const positional = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));
const [refArg, cloneArg] = positional;
if (!refArg || !cloneArg) {
  console.error('usage: node compare.mjs <reference> <clone> [--width px] [--height px] [--out dir]');
  process.exit(1);
}
const WIDTH = Number(opt('width', 1440));
const HEIGHT = Number(opt('height', 900));
const OUT = path.resolve(opt('out', 'clone-diff'));

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.json': 'application/json', '.mp4': 'video/mp4' };
const servers = [];
async function serve(root) {
  const server = createServer(async (req, res) => {
    try {
      let p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if ((await stat(p)).isDirectory()) p = path.join(p, 'index.html');
      res.writeHead(200, { 'content-type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream' });
      res.end(await readFile(p));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}/`;
}

async function toUrlOrPng(arg) {
  if (/^https?:\/\//.test(arg)) return { url: arg };
  const abs = path.resolve(arg);
  if (abs.toLowerCase().endsWith('.png')) return { png: await readFile(abs) };
  const s = await stat(abs);
  if (s.isDirectory()) return { url: await serve(abs) };
  return { url: (await serve(path.dirname(abs))) + encodeURIComponent(path.basename(abs)) };
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });

async function shoot(src) {
  if (src.png) return src.png;
  const page = await ctx.newPage();
  await page.goto(src.url, { waitUntil: 'networkidle', timeout: 90_000 }).catch(() => {});
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(800);
  const buf = await page.screenshot({ fullPage: true, animations: 'disabled' });
  await page.close();
  return buf;
}

const [refPng, clonePng] = [await shoot(await toUrlOrPng(refArg)), await shoot(await toUrlOrPng(cloneArg))];

// Pixel diff inside the browser (canvas) so no extra npm deps are needed.
const page = await ctx.newPage();
const result = await page.evaluate(
  async ({ a, b }) => {
    const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const w = Math.max(ia.width, ib.width), h = Math.max(ia.height, ib.height);
    const read = (img) => { const c = new OffscreenCanvas(w, h); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data; };
    const da = read(ia), db = read(ib);
    const out = new OffscreenCanvas(w, h), ox = out.getContext('2d'), od = ox.createImageData(w, h);
    let diff = 0;
    const rows = new Array(Math.ceil(h / 100)).fill(0);
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
      if (d > 48) {
        diff++;
        rows[Math.floor(i / 4 / w / 100)]++;
        od.data[i] = 255; od.data[i + 1] = 0; od.data[i + 2] = 0; od.data[i + 3] = 255;
      } else {
        const g = (da[i] + da[i + 1] + da[i + 2]) / 3;
        od.data[i] = od.data[i + 1] = od.data[i + 2] = 255 - (255 - g) * 0.25; od.data[i + 3] = 255;
      }
    }
    ox.putImageData(od, 0, 0);
    const blob = await out.convertToBlob({ type: 'image/png' });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const worst = rows.map((n, i) => ({ y: i * 100, pct: (n / (w * 100)) * 100 })).sort((x, y) => y.pct - x.pct).slice(0, 5).filter((r) => r.pct > 1);
    return { w, h, sizeA: [ia.width, ia.height], sizeB: [ib.width, ib.height], pct: (diff / (w * h)) * 100, png: btoa(bin), worst };
  },
  { a: `data:image/png;base64,${refPng.toString('base64')}`, b: `data:image/png;base64,${clonePng.toString('base64')}` },
);

await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'reference.png'), refPng);
await writeFile(path.join(OUT, 'clone.png'), clonePng);
await writeFile(path.join(OUT, 'diff.png'), Buffer.from(result.png, 'base64'));
await browser.close();
servers.forEach((s) => s.close());

console.log(`reference ${result.sizeA.join('x')}  clone ${result.sizeB.join('x')}  @ ${WIDTH}px wide`);
if (result.sizeA[1] !== result.sizeB[1]) console.log(`! page heights differ by ${result.sizeB[1] - result.sizeA[1]}px — fix section heights/spacing first`);
console.log(`mismatch: ${result.pct.toFixed(2)}% of pixels`);
for (const r of result.worst) console.log(`  worst band y=${r.y}-${r.y + 100}px: ${r.pct.toFixed(1)}% changed`);
console.log(`images: ${path.relative(process.cwd(), OUT)}/{reference,clone,diff}.png`);
