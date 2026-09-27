import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
const dir = process.argv[2], out = process.argv[3];
const files = fs.readdirSync(dir).filter(f => f.endsWith('.svg')).sort();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
fs.mkdirSync(out, { recursive: true });
for (const f of files) {
  const svg = fs.readFileSync(dir + '/' + f, 'utf8');
  const t0 = Date.now();
  await page.setContent(`<html><body style="margin:0;background:#000">${svg}</body></html>`);
  const t1 = Date.now();
  await page.screenshot({ path: `${out}/${f.replace('.svg', '.png')}` });
  const t2 = Date.now();
  const t3 = Date.now(); await page.screenshot({ type: 'jpeg' }); const t4 = Date.now();
  console.log(f, 'load', t1 - t0, 'shot', t2 - t1, 're-shot', t4 - t3);
}
await browser.close();
