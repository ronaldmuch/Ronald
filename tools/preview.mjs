// Renderiza cuadros sueltos para revisar: node tools/preview.mjs <salida> t1 t2 ... [--only=01,02] [--shot=12:0,1.5,3]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import path from 'path';
import { serve } from './serve.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const out = args.shift();
const only = (args.find(a => a.startsWith('--only=')) || '').slice(7);
const scale = +((args.find(a => a.startsWith('--scale=')) || '--scale=0.5').slice(8));
let times = args.filter(a => !a.startsWith('--')).map(Number);
const shotArgs = args.filter(a => a.startsWith('--shot=')).map(a => a.slice(7));
fs.mkdirSync(out, { recursive: true });
const { srv, url } = await serve(ROOT);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: scale });
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(`${url}/src/player.html${only ? '?only=' + only : ''}`);
await page.waitForFunction(() => window.READY === true, null, { timeout: 120000 });
if (shotArgs.length) {
  const sched = await page.evaluate(() => window.P.schedule());
  for (const sa of shotArgs) { const [id, ts] = sa.split(':'); const s = sched.find(x => x.id === id); for (const v of ts.split(',')) times.push(s.start + +v); }
}
for (const t of times) {
  const t0 = Date.now();
  const info = await page.evaluate(t => window.P.render(t), t);
  const t1 = Date.now();
  const file = `${out}/t${t.toFixed(3).padStart(8, '0')}.png`;
  await page.screenshot({ path: file });
  console.log(file, info.shots.join('+'), 'render', t1 - t0, 'ms shot', Date.now() - t1, 'ms');
}
await browser.close(); srv.close();
