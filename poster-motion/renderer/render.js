const { chromium } = require('playwright');
const fs = require('fs');
const dir = process.argv[2], out = process.argv[3], only = process.argv[4] ? process.argv[4].split(',').map(Number) : null;
(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('file://' + dir + '/anim.html');
  await p.evaluate(() => window.ready);
  const n = await p.evaluate(() => TOTAL_FRAMES);
  const frames = only || [...Array(n).keys()];
  fs.mkdirSync(out, { recursive: true });
  for (const f of frames) {
    const url = await p.evaluate(f => renderFrame(f), f);
    fs.writeFileSync(`${out}/f_${String(f).padStart(4, '0')}.png`, Buffer.from(url.split(',')[1], 'base64'));
  }
  console.log('rendered', frames.length);
  await b.close();
})();
