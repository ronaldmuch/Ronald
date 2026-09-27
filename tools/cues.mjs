// Exporta el horario de tomas + todos los cues de sonido (absolutos) para el mezclador de audio.
import fs from 'fs';
import path from 'path';
import { SHOTS, TAIL } from '../src/shots.js';
import { BPM, BEAT, FPS } from '../src/engine.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let b = 0;
const shots = SHOTS.map(d => { const s = { id: d.id, b0: b, beats: d.beats, start: b * BEAT, end: (b + d.beats) * BEAT, out: d.out ? { type: d.out.type, pre: d.out.pre || 0, post: d.out.post || 0, dir: d.out.dir || 0 } : null }; b += d.beats; return s; });
const cues = [];
const f = 1 / FPS;
SHOTS.forEach((d, i) => {
  const s = shots[i];
  for (const [t, name, o = {}] of d.sfx || []) { if ((o.gain ?? 1) <= 0) continue; cues.push({ t: s.start + t, name, shot: d.id, ...o }); }
  const o = s.out; if (!o) return;
  const T = s.end;
  const add = (t, name, opt = {}) => cues.push({ t, name, shot: d.id, auto: true, ...opt });
  switch (o.type) {
    case 'whip': add(T - o.pre - 2 * f, 'whip', { gain: 0.75, pan: o.dir * 0.6, dir: o.dir }); break;
    case 'zoomflash': add(T - o.pre - 4 * f, 'zoom_whoosh', { gain: 0.8 }); add(T, 'flash_shimmer', { gain: 0.5 }); break;
    case 'wipe': add(T - o.pre, 'trail_whoosh', { gain: 0.8, dir: 1 }); break;
    case 'ripple': add(T - o.pre, 'ripple', { gain: 0.6 }); break;
    case 'dissolve': add(T - o.pre, 'soft_swell', { gain: 0.35 }); break;
    case 'flash': add(T - 0.02, 'flash_hit', { gain: 0.55 }); break;
  }
});
cues.sort((a, b) => a.t - b.t);
const total = shots[shots.length - 1].end + TAIL;
fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'build/cues.json'), JSON.stringify({ bpm: BPM, beat: BEAT, fps: FPS, total, shots, cues }, null, 1));
console.log(`${shots.length} tomas, ${cues.length} cues, ${total.toFixed(2)} s`);
