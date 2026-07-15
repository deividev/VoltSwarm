import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

// Cuts the head + wordmark out of tmp/imagegen/capsule-ref.png by keying the
// dark background to transparent. Outputs transparent PNGs to tmp/imagegen/.
const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
];
const chromePath = CHROME_PATHS.find((p) => existsSync(p));
const browser = await puppeteer.launch({ executablePath: chromePath, headless: 'new' });
const page = await browser.newPage();

const refDataUrl = 'data:image/png;base64,' + readFileSync('tmp/imagegen/capsule-ref.png').toString('base64');
await page.setContent(`<img id="src" src="${refDataUrl}">`);
await page.evaluate(() => new Promise((r) => {
  const img = document.getElementById('src');
  if (img.complete && img.naturalWidth) r(); else img.onload = () => r();
}));

// crop = [x0,y0,x1,y1] in source px.
// mode 'luma': keep by brightness (head — keeps its cyan halo, soft falloff).
// mode 'warm': keep warm/yellow letters + bright rims, drop blue fog + dark bg.
const jobs = [
  { name: 'head-ref',     crop: [656, 6, 1006, 372],   mode: 'luma', lo: 0.17, hi: 0.32 },
  { name: 'wordmark-ref', crop: [268, 362, 1410, 543], mode: 'warm' },
];

for (const job of jobs) {
  const dataUrl = await page.evaluate((job) => {
    const img = document.getElementById('src');
    const [x0, y0, x1, y1] = job.crop;
    const w = x1 - x0, h = y1 - y0;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, x0, y0, w, h, 0, 0, w, h);
    const id = ctx.getImageData(0, 0, w, h);
    const d = id.data;
    const sm = (a, b, x) => { let t = (x - a) / (b - a); return t < 0 ? 0 : t > 1 ? 1 : t; };
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const v = Math.max(r, g, b);
      let m;
      if (job.mode === 'warm') {
        // warmth: red/yellow dominant over blue → the logo. Bright: white rims + cyan chips.
        const warmGate = r > b + 16 ? 1 : 0;
        const s1 = warmGate * sm(70, 115, r);
        const s2 = sm(185, 225, v);
        m = Math.max(s1, s2);
      } else {
        m = sm(job.lo * 255, job.hi * 255, v);
      }
      d[i + 3] = Math.round(d[i + 3] * m);
    }
    ctx.putImageData(id, 0, 0);
    return c.toDataURL('image/png');
  }, job);
  const base64 = dataUrl.split(',')[1];
  writeFileSync(`tmp/imagegen/${job.name}.png`, Buffer.from(base64, 'base64'));
  console.log(`saved tmp/imagegen/${job.name}.png`);
}
await browser.close();
