// Render final cuadro a cuadro (1920×1080 @ 24 fps) en paralelo → segmentos H.264 → concat + audio.
//   node tools/render.mjs [--workers=3] [--from=0] [--to=<seg>] [--out=build/video.mp4] [--q=92]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { serve } from './serve.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const FFMPEG = process.env.FFMPEG || '/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2';
const FPS = 24;
const WORKERS = +arg('workers', 3);
const Q = +arg('q', 92);
const OUT = path.resolve(ROOT, arg('out', 'build/video.mp4'));
const SEGDIR = path.join(ROOT, 'build/segments');
fs.mkdirSync(SEGDIR, { recursive: true });

const { srv, url } = await serve(ROOT);
const browser = await chromium.launch({ args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });

async function openPlayer() {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(`${url}/src/player.html`);
  await page.waitForFunction(() => window.READY === true, null, { timeout: 300000 });
  const cdp = await page.context().newCDPSession(page);
  return { page, cdp };
}

const probe = await openPlayer();
const TOTAL = await probe.page.evaluate(() => window.TOTAL);
const NF = Math.ceil(TOTAL * FPS);
const from = +arg('from', 0), to = +arg('to', NF);
await probe.page.close();
console.log(`total ${TOTAL.toFixed(2)} s → ${NF} cuadros; render ${from}..${to} con ${WORKERS} procesos`);

function encoder(file) {
  const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '13', '-pix_fmt', 'yuv420p', '-tune', 'animation', '-g', '48', file], { stdio: ['pipe', 'inherit', 'inherit'] });
  return ff;
}

const chunk = Math.ceil((to - from) / WORKERS);
const t0 = Date.now();
let done = 0;
const segs = [];
await Promise.all(Array.from({ length: WORKERS }, async (_, w) => {
  const a = from + w * chunk, b = Math.min(to, a + chunk);
  if (a >= b) return;
  const file = path.join(SEGDIR, `seg_${String(a).padStart(5, '0')}.mp4`);
  segs.push(file);
  const { page, cdp } = await openPlayer();
  const ff = encoder(file);
  for (let i = a; i < b; i++) {
    await page.evaluate(t => window.P.render(t), i / FPS);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: Q, optimizeForSpeed: false });
    const buf = Buffer.from(data, 'base64');
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    done++;
    if (done % 48 === 0) { const el = (Date.now() - t0) / 1000; console.log(`${done}/${to - from} cuadros · ${(el / done * 1000).toFixed(0)} ms/cuadro · ETA ${((to - from - done) * el / done / 60).toFixed(1)} min`); }
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await page.close();
}));
await browser.close(); srv.close();
segs.sort();
fs.writeFileSync(path.join(SEGDIR, 'list.txt'), segs.map(s => `file '${s}'`).join('\n'));
console.log(`video listo en ${((Date.now() - t0) / 60000).toFixed(1)} min`);
// concat + audio
const audio = path.join(ROOT, 'build/audio_mix.wav');
const args = ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(SEGDIR, 'list.txt')];
if (fs.existsSync(audio) && from === 0 && to === NF) args.push('-i', audio, '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-shortest');
args.push('-c:v', 'libx264', '-preset', 'slow', '-crf', arg('crf', '18'), '-pix_fmt', 'yuv420p', '-tune', 'animation', '-movflags', '+faststart', OUT);
await new Promise(r => spawn(FFMPEG, args, { stdio: 'inherit' }).on('close', r));
console.log('→', OUT);
