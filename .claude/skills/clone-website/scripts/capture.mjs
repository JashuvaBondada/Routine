#!/usr/bin/env node
// Capture a live web page as a self-contained, offline, pixel-faithful local copy.
//
// Usage:
//   node capture.mjs <url> [--out <dir>] [--keep-scripts] [--wait <ms>]
//                          [--width <px>] [--height <px>] [--no-scroll]
//
// Output (in --out, default ./clone-<host>):
//   index.html                 rendered DOM snapshot with every asset URL rewritten to local paths
//   assets/<host>/<path>       stylesheets, images, fonts, media (and scripts with --keep-scripts)
//   original-desktop.png       full-page screenshot of the live page at --width x --height
//   original-mobile.png        full-page screenshot at 390x844 (iPhone-class viewport)
//   manifest.json              url -> local file map, plus anything that failed to download

import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require(path.join(process.env.NODE_PATH || '/opt/node22/lib/node_modules', 'playwright')));
}

// ---------- args ----------
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const target = argv.find((a) => /^https?:\/\//.test(a));
if (!target) {
  console.error('usage: node capture.mjs <url> [--out dir] [--keep-scripts] [--wait ms] [--width px] [--height px] [--no-scroll]');
  process.exit(1);
}
const OUT = path.resolve(opt('out', `clone-${new URL(target).hostname}`));
const KEEP_SCRIPTS = flag('keep-scripts');
const SETTLE_MS = Number(opt('wait', 1500));
const WIDTH = Number(opt('width', 1440));
const HEIGHT = Number(opt('height', 900));
const SCROLL = !flag('no-scroll');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

// ---------- url -> local path ----------
const EXT_BY_TYPE = {
  'text/css': '.css',
  'text/javascript': '.js',
  'application/javascript': '.js',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/svg+xml': '.svg',
  'image/x-icon': '.ico',
  'image/vnd.microsoft.icon': '.ico',
  'font/woff2': '.woff2',
  'font/woff': '.woff',
  'font/ttf': '.ttf',
  'font/otf': '.otf',
  'application/font-woff2': '.woff2',
  'application/font-woff': '.woff',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'audio/mpeg': '.mp3',
  'application/json': '.json',
};

const files = new Map(); // absolute url -> { local, body, type }
const failed = [];

function stripHash(u) {
  const x = new URL(u);
  x.hash = '';
  return x.href;
}

function localPathFor(u, contentType = '') {
  const x = new URL(u);
  let p = decodeURIComponent(x.pathname).replace(/[^\w.\-/@]+/g, '_');
  if (p.endsWith('/')) p += 'index';
  let ext = path.extname(p);
  const typeExt = EXT_BY_TYPE[contentType.split(';')[0].trim().toLowerCase()];
  if (x.search) {
    const h = createHash('sha1').update(x.search).digest('hex').slice(0, 8);
    p = p.slice(0, p.length - ext.length) + `.${h}` + ext;
  }
  if (!ext && typeExt) p += typeExt;
  const host = x.host.replace(/[^\w.\-]+/g, '_');
  return path.posix.join('assets', host, p.replace(/^\/+/, '')).slice(0, 240);
}

function isFetchable(u) {
  return /^https?:/i.test(u);
}

// ---------- capture ----------
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 1,
  userAgent: UA,
  ignoreHTTPSErrors: true,
});
const page = await context.newPage();

const KEEP_TYPES = new Set(['stylesheet', 'image', 'font', 'media', 'script', 'other', 'fetch', 'xhr']);
page.on('response', async (res) => {
  try {
    const req = res.request();
    if (!KEEP_TYPES.has(req.resourceType())) return;
    if (req.resourceType() !== 'script' && ['fetch', 'xhr'].includes(req.resourceType()) && !KEEP_SCRIPTS) return;
    if (res.status() < 200 || res.status() >= 300) return;
    const u = stripHash(res.url());
    if (!isFetchable(u) || files.has(u)) return;
    const type = res.headers()['content-type'] || '';
    const body = await res.body();
    files.set(u, { local: localPathFor(u, type), body, type, kind: req.resourceType() });
  } catch {
    /* body unavailable (redirect, aborted) — fetched later if referenced */
  }
});

console.log(`→ loading ${target}`);
try {
  await page.goto(target, { waitUntil: 'networkidle', timeout: 90_000 });
} catch (e) {
  const msg = e.message.split('\n')[0];
  if (/ERR_|NS_ERROR|net::/.test(msg) || !/Timeout/i.test(msg)) {
    console.error(`✗ could not load ${target}: ${msg}`);
    console.error('  If this is a network-policy block, allow the host in the environment settings, or save the page from a browser and work from that.');
    await browser.close();
    process.exit(2);
  }
  console.warn(`  networkidle not reached (${msg}); continuing after load`);
  await page.waitForLoadState('load').catch(() => {});
}

if (SCROLL) {
  // Scroll through the page so lazy-loaded images / sections / scroll-triggered animations fire.
  await page.evaluate(async () => {
    const step = Math.max(200, window.innerHeight * 0.75);
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState('networkidle').catch(() => {});
}
await page.waitForTimeout(SETTLE_MS);

await mkdir(OUT, { recursive: true });
console.log('→ screenshots of the original');
await page.screenshot({ path: path.join(OUT, 'original-desktop.png'), fullPage: true, animations: 'disabled' });
{
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    userAgent: UA,
    ignoreHTTPSErrors: true,
  });
  const mp = await mobile.newPage();
  await mp.goto(target, { waitUntil: 'networkidle', timeout: 90_000 }).catch(() => {});
  await mp.waitForTimeout(SETTLE_MS);
  await mp.screenshot({ path: path.join(OUT, 'original-mobile.png'), fullPage: true, animations: 'disabled' }).catch(() => {});
  await mobile.close();
}

// ---------- freeze the rendered DOM ----------
console.log('→ freezing rendered DOM');
const assetRefs = await page.evaluate((keepScripts) => {
  const abs = (v) => {
    try {
      return new URL(v, document.baseURI).href;
    } catch {
      return null;
    }
  };
  const refs = new Set();
  const add = (v) => {
    const a = v && abs(v);
    if (a && /^https?:/.test(a)) refs.add(a.split('#')[0]);
    return a;
  };

  // 1. CSS-in-JS: rules inserted via CSSOM (styled-components, emotion…) never show up in textContent.
  for (const sheet of document.styleSheets) {
    const node = sheet.ownerNode;
    if (!node || node.tagName !== 'STYLE') continue;
    try {
      const text = [...sheet.cssRules].map((r) => r.cssText).join('\n');
      if (text.length > node.textContent.length) node.textContent = text;
    } catch {}
  }
  // Constructable / adopted stylesheets.
  for (const sheet of document.adoptedStyleSheets || []) {
    try {
      const s = document.createElement('style');
      s.setAttribute('data-clone', 'adopted');
      s.textContent = [...sheet.cssRules].map((r) => r.cssText).join('\n');
      document.head.appendChild(s);
    } catch {}
  }

  // 2. Lock in what the browser actually chose / lazy-loaded.
  for (const img of document.images) {
    if (img.currentSrc) img.setAttribute('src', img.currentSrc);
    img.removeAttribute('loading');
    for (const a of ['data-src', 'data-lazy-src', 'data-original']) img.removeAttribute(a);
  }
  // 3. Canvas → static image (charts, WebGL heroes), when not tainted.
  for (const c of document.querySelectorAll('canvas')) {
    try {
      const img = document.createElement('img');
      img.src = c.toDataURL('image/png');
      img.className = c.className;
      img.style.cssText = c.style.cssText;
      img.width = c.clientWidth;
      img.height = c.clientHeight;
      c.replaceWith(img);
    } catch {}
  }
  // 4. Form state (typed values, checked boxes) into attributes.
  for (const el of document.querySelectorAll('input, textarea, select')) {
    if (el.type === 'password') continue;
    if (el.tagName === 'TEXTAREA') el.textContent = el.value;
    else if (el.type === 'checkbox' || el.type === 'radio') el.toggleAttribute('checked', el.checked);
    else if (el.tagName !== 'SELECT' && el.value) el.setAttribute('value', el.value);
  }

  // 5. Scripts, analytics and anything that would phone home or re-hydrate.
  if (!keepScripts) {
    document.querySelectorAll('script:not([type="application/ld+json"]), noscript').forEach((s) => s.remove());
    document.querySelectorAll('link[rel="modulepreload"], link[as="script"]').forEach((l) => l.remove());
    for (const el of document.querySelectorAll('*')) {
      for (const a of [...el.attributes]) if (/^on/i.test(a.name)) el.removeAttribute(a.name);
    }
  }
  document.querySelectorAll('iframe[src*="googletagmanager"], iframe[src*="doubleclick"]').forEach((f) => f.remove());
  document.querySelectorAll('base').forEach((b) => b.remove());
  document.querySelectorAll('meta[http-equiv="Content-Security-Policy" i]').forEach((m) => m.remove());
  // Forms must never submit to the original site from a copy.
  document.querySelectorAll('form').forEach((f) => {
    f.setAttribute('action', '#');
    f.removeAttribute('target');
  });

  // 6. Collect every asset reference (absolutized).
  const ATTRS = ['src', 'poster', 'data-src'];
  for (const el of document.querySelectorAll('[src], [poster]')) for (const a of ATTRS) if (el.getAttribute(a)) add(el.getAttribute(a));
  for (const el of document.querySelectorAll('[srcset]')) {
    for (const part of el.getAttribute('srcset').split(',')) add(part.trim().split(/\s+/)[0]);
  }
  for (const l of document.querySelectorAll('link[href]')) {
    if (/stylesheet|icon|preload|apple-touch|manifest|mask-icon/i.test(l.rel)) add(l.getAttribute('href'));
  }
  for (const u of document.querySelectorAll('use[href], use[*|href], image[href], image[*|href]')) {
    add(u.getAttribute('href') || u.getAttribute('xlink:href'));
  }
  const cssUrl = /url\(\s*(['"]?)(.*?)\1\s*\)/g;
  for (const el of document.querySelectorAll('[style]')) for (const m of el.getAttribute('style').matchAll(cssUrl)) add(m[2]);
  for (const s of document.querySelectorAll('style')) for (const m of s.textContent.matchAll(cssUrl)) add(m[2]);
  for (const m of document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"]')) add(m.content);
  return [...refs];
}, KEEP_SCRIPTS);

// ---------- download anything referenced but not yet captured ----------
async function fetchAsset(u) {
  u = stripHash(u);
  if (files.has(u) || !isFetchable(u)) return files.get(u);
  try {
    const res = await context.request.get(u, { headers: { Referer: target }, timeout: 30_000 });
    if (!res.ok()) throw new Error(`HTTP ${res.status()}`);
    const type = res.headers()['content-type'] || '';
    const entry = { local: localPathFor(u, type), body: await res.body(), type, kind: 'fetched' };
    files.set(u, entry);
    return entry;
  } catch (e) {
    failed.push({ url: u, error: String(e.message || e).split('\n')[0] });
  }
}
console.log(`→ ${assetRefs.length} asset references, ${files.size} captured from network`);
for (const u of assetRefs) await fetchAsset(u);

// ---------- rewrite stylesheets (url(), @import), recursively pulling fonts/images ----------
const isCss = (u, e) => /text\/css/.test(e.type) || (/\.css(\?|$)/i.test(u) && !/javascript/.test(e.type));
const cssUrlRe = /url\(\s*(['"]?)(.*?)\1\s*\)/g;
const importRe = /@import\s+(['"])(.*?)\1/g;

async function rewriteCss(text, baseUrl, fromLocalDir) {
  const refs = new Set();
  for (const m of text.matchAll(cssUrlRe)) refs.add(m[2]);
  for (const m of text.matchAll(importRe)) refs.add(m[2]);
  const map = new Map();
  for (const r of refs) {
    if (!r || r.startsWith('data:') || r.startsWith('#')) continue;
    let a;
    try {
      a = stripHash(new URL(r, baseUrl).href);
    } catch {
      continue;
    }
    const entry = await fetchAsset(a);
    if (entry) {
      const hash = r.includes('#') ? r.slice(r.indexOf('#')) : '';
      map.set(r, path.posix.relative(fromLocalDir, entry.local) + hash);
    }
  }
  return text
    .replace(cssUrlRe, (all, q, r) => (map.has(r) ? `url("${map.get(r)}")` : all))
    .replace(importRe, (all, q, r) => (map.has(r) ? `@import "${map.get(r)}"` : all));
}

const doneCss = new Set();
let pending;
do {
  pending = [...files.entries()].filter(([u, e]) => isCss(u, e) && !doneCss.has(u));
  for (const [u, e] of pending) {
    doneCss.add(u);
    e.local = e.local.endsWith('.css') ? e.local : e.local + '.css';
    e.body = Buffer.from(await rewriteCss(e.body.toString('utf8'), u, path.posix.dirname(e.local)));
  }
} while (pending.length);

// ---------- rewrite the DOM to local paths and serialize ----------
const urlMap = Object.fromEntries([...files].map(([u, e]) => [u, e.local]));
const inlineCssFixups = {};
await page.evaluate(
  ({ urlMap }) => {
    const local = (v) => {
      if (!v || v.startsWith('data:') || v.startsWith('#')) return v;
      try {
        const a = new URL(v, document.baseURI);
        const hash = a.hash;
        a.hash = '';
        return urlMap[a.href] ? urlMap[a.href] + hash : v;
      } catch {
        return v;
      }
    };
    const cssUrl = /url\(\s*(['"]?)(.*?)\1\s*\)/g;
    const fixCss = (t) => t.replace(cssUrl, (all, q, r) => (local(r) !== r ? `url("${local(r)}")` : all));

    for (const el of document.querySelectorAll('[src]')) el.setAttribute('src', local(el.getAttribute('src')));
    for (const el of document.querySelectorAll('[poster]')) el.setAttribute('poster', local(el.getAttribute('poster')));
    for (const el of document.querySelectorAll('[srcset]')) {
      el.setAttribute(
        'srcset',
        el
          .getAttribute('srcset')
          .split(',')
          .map((p) => {
            const [u, ...d] = p.trim().split(/\s+/);
            return [local(u), ...d].join(' ');
          })
          .join(', '),
      );
    }
    for (const l of document.querySelectorAll('link[href]')) {
      if (/stylesheet|icon|preload|apple-touch|manifest|mask-icon/i.test(l.rel)) {
        l.setAttribute('href', local(l.getAttribute('href')));
        l.removeAttribute('integrity');
        l.removeAttribute('crossorigin');
      }
    }
    for (const s of document.querySelectorAll('script[src]')) {
      s.removeAttribute('integrity');
      s.removeAttribute('crossorigin');
    }
    for (const u of document.querySelectorAll('use, image')) {
      for (const a of ['href', 'xlink:href']) if (u.getAttribute(a)) u.setAttribute(a, local(u.getAttribute(a)));
    }
    for (const el of document.querySelectorAll('[style]')) el.setAttribute('style', fixCss(el.getAttribute('style')));
    for (const s of document.querySelectorAll('style')) s.textContent = fixCss(s.textContent);
    // Make in-page links point back at the original site (other pages aren't part of this clone).
    for (const a of document.querySelectorAll('a[href]')) {
      const h = a.getAttribute('href');
      if (h && !h.startsWith('#') && !/^(mailto|tel|javascript):/i.test(h)) {
        try {
          a.setAttribute('href', new URL(h, document.baseURI).href);
        } catch {}
      }
    }
  },
  { urlMap },
);

let html = await page.content();
if (!/<meta[^>]+charset/i.test(html)) html = html.replace(/<head([^>]*)>/i, '<head$1><meta charset="utf-8">');
html = html.replace(/<head([^>]*)>/i, `<head$1>\n<!-- Captured from ${target} on ${new Date().toISOString()} -->`);

// ---------- write everything ----------
await writeFile(path.join(OUT, 'index.html'), html);
let bytes = 0;
for (const [, e] of files) {
  if (!KEEP_SCRIPTS && e.kind === 'script') continue;
  const dest = path.join(OUT, e.local);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, e.body);
  bytes += e.body.length;
}
await writeFile(
  path.join(OUT, 'manifest.json'),
  JSON.stringify({ source: target, capturedAt: new Date().toISOString(), viewport: { width: WIDTH, height: HEIGHT }, keepScripts: KEEP_SCRIPTS, files: urlMap, failed }, null, 2),
);

await browser.close();
console.log(`✓ wrote ${OUT}`);
console.log(`  ${files.size} assets (${(bytes / 1024 / 1024).toFixed(1)} MB), ${failed.length} failed`);
if (failed.length) for (const f of failed.slice(0, 10)) console.log(`  ✗ ${f.url} — ${f.error}`);
console.log(`  next: node ${path.relative(process.cwd(), path.join(path.dirname(new URL(import.meta.url).pathname), 'compare.mjs'))} ${target} ${path.relative(process.cwd(), OUT)}`);
