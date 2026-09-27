import { FPS, BEAT, W, H, E, clamp, lerp, prog, Shot, camAt, camMatrix, chain, T, S, R, mul, apply, fbm, I } from './engine.js';
import { SHOTS, TAIL } from './shots.js';

const stage = document.getElementById('stage');
const fx = {
  black: document.getElementById('fx-black'),
  flash: document.getElementById('fx-flash'),
  glow: document.getElementById('fx-glow'),
  band: document.getElementById('fx-band'),
  ring: document.getElementById('fx-ring'),
  ringC: document.getElementById('fx-ring-c'),
  tint: document.getElementById('fx-tint'),
  vig: document.getElementById('fx-vig'),
};
const mbOut = document.querySelector('#mbOut feGaussianBlur');
const mbIn = document.querySelector('#mbIn feGaussianBlur');
const mbCam = document.querySelector('#mbCam feGaussianBlur');

// ── horario: cada toma dura un número entero de beats (los cortes caen en el beat) ──
let b = 0;
for (const d of SHOTS) { d.b0 = b; d.start = b * BEAT; d.dur = d.beats * BEAT; d.end = d.start + d.dur; b += d.beats; }
export const TOTAL = SHOTS[SHOTS.length - 1].end + TAIL;

const runtime = new Map();
export async function load(onlyIds) {
  const xf = await (await fetch('../assets/prod/xf.json')).json();
  for (const d of SHOTS) {
    if (onlyIds && !onlyIds.includes(d.id)) continue;
    const [svg, kf] = await Promise.all([
      fetch(`../assets/baked/shot_${d.id}.svg`).then(r => r.text()),
      fetch(`../assets/prod/shot_${d.id}.kf.json`).then(r => r.json()),
    ]);
    const s = new Shot(d, svg, kf, xf, stage);
    s.div.style.display = 'block';   // getBBox necesita que esté en el layout
    // las imágenes horneadas deben estar cargadas antes de capturar cuadros
    const imgs = [...s.svg.querySelectorAll('image')];
    await Promise.all(imgs.map(im => new Promise(res => {
      im.setAttribute('decoding', 'sync');
      const href = im.getAttribute('href');
      const pre = new Image(); pre.src = new URL(href, location.href).href;
      pre.decode().then(res, res);
      s.keep = (s.keep || []).concat(pre);
    })));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    d.setup && d.setup(makeCtx(s, 0));
    s.div.style.display = 'none';
    runtime.set(d.id, s);
  }
}

function makeCtx(s, ts) {
  const d = s.def;
  const dur = d.dur;
  const k = s.figmaDur / dur;
  const ctx = {
    t: ts, dur, k, s, d,
    F: tf => tf / k,                               // tiempo Figma → segundos reales de la toma
    c: (name, within) => { const el = typeof name === 'string' ? s.find(name, within) : name; return el ? s.ctl(el) : null; },
    cAll: (name, within) => s.findAll(name, within).map(el => s.ctl(el)),
    el: (name, within) => s.find(name, within),
    bbox: (name) => { const el = typeof name === 'string' ? s.find(name) : name; const b = el.getBBox(); return [b.x, b.y, b.width, b.height]; },
    fx: FXSTATE,
    beat: n => n * BEAT,
  };
  return ctx;
}

// estado global de efectos (se resetea cada cuadro)
const FXSTATE = {};
function resetFx() {
  Object.assign(FXSTATE, { black: 0, flash: 0, flashColor: '#ffffff', glow: 0, glowX: 960, glowY: 600, glowR: 180, glowColor: '80,160,255', tint: 0, tintColor: '255,170,60', tintBlend: 'soft-light', band: null, ring: null, shake: 0, door: null });
}

// cámara de la toma: plan (rects A/B/C) o la de Figma + drift + sacudidas
function cameraFor(s, ts, ctx) {
  const d = s.def;
  const still = d.stillAfter != null && ts >= d.stillAfter;   // toma 28: la cámara se detiene del todo
  const amp = still ? 0 : (d.drift ?? 1);
  const ph = d.b0 * 1.37;
  const u = ts * 0.35 + ph;
  const nx = fbm(u, 1) * 10 * amp, ny = fbm(u, 2) * 7 * amp, nr = fbm(u * 0.8, 3) * 0.22 * amp, nz = 1 + (0.018 + fbm(u * 0.6, 4) * 0.006) * amp;
  // sacudidas por impactos (lista de tiempos en la toma)
  let sx = 0, sy = 0, sr = 0;
  for (const it of d.shakes || []) {
    const [t0, a0] = Array.isArray(it) ? it : [it, 1];
    const dt = ts - t0;
    if (dt >= 0 && dt < 0.2) { const e = Math.exp(-dt * 14) * a0; sx += Math.sin(dt * 95) * 14 * e; sy += Math.cos(dt * 120) * 11 * e; sr += Math.sin(dt * 70) * 0.5 * e; }
  }
  const drift = chain(T(W / 2 + nx + sx, H / 2 + ny + sy), R(nr + sr), S(nz), T(-W / 2, -H / 2));
  let cam = null, M;
  if (d.cam) {
    cam = camAt(ts, d.cam);
    if (d.camMod) cam = d.camMod(cam, ts, ctx) || cam;
    M = camMatrix(cam);
  } else M = I;
  return { cam, M, drift };
}

function renderShot(s, ts, style) {
  const d = s.def;
  const tsC = clamp(ts, 0, d.dur);
  const ctx = makeCtx(s, tsC);
  ctx.tRaw = ts;
  let tau = d.timeMap ? d.timeMap(tsC, ctx) : tsC * ctx.k;
  tau = clamp(tau, 0, s.figmaDur);
  ctx.tau = tau;
  s.reset();
  const camC = s.cameraCtl;
  s.applyFigma(tau, d.cam ? (c => c === camC) : null);
  const { cam, M, drift } = cameraFor(s, tsC, ctx);
  ctx.cam = cam; ctx.camM = M; ctx.drift = drift;
  // desenfoque de movimiento según la velocidad de la cámara (whip-pans y pull-outs rápidos)
  let camBlur = null;
  if (d.cam && tsC > 0 && tsC < d.dur) {
    const p0 = camAt(Math.max(0, tsC - 1 / FPS), d.cam), p1 = cam;
    const z = p1.z;
    const vx = (p1.cx - p0.cx) * z, vy = (p1.cy - p0.cy) * z, vz = Math.abs(Math.log(p1.z / p0.z)) * 900;
    const zb = Math.max(0, vz - 45) * 0.04;
    const sx = Math.min(60, Math.max(0, Math.abs(vx) - 22) * 0.24 + zb), sy = Math.min(45, Math.max(0, Math.abs(vy) - 22) * 0.24 + zb);
    if (sx > 0.5 || sy > 0.5) camBlur = [sx, sy];
  }
  if (camC) {
    if (d.cam) camC.C = mul(drift, M);
    else camC.C = mul(drift, camC.C);
  }
  // fondo con parallax (se mueve ~30 % de lo que se mueve la cámara)
  for (const bg of s.bgCtls) {
    const z = cam ? cam.z : 1;
    const zb = Math.max(1, 1 + (z - 1) * 0.3) * 1.04;
    let cx = W / 2, cy = H / 2;
    if (cam) { cx = lerp(W / 2, cam.cx, 0.3); cy = lerp(H / 2, cam.cy, 0.3); }
    cx = clamp(cx, W / 2 / zb, W - W / 2 / zb); cy = clamp(cy, H / 2 / zb, H - H / 2 / zb);
    bg.C = chain(T(W / 2, H / 2), R(cam ? cam.rot * 0.3 : 0), S(zb), T(-cx, -cy));
  }
  // matriz total de pantalla para un punto de la capa de cámara
  ctx.toScreen = (x, y) => { const m = camC ? camC.C : I; return apply(m, x, y); };
  d.update && d.update(ctx);
  s.commit();
  // estilo del contenedor (transiciones)
  const st = s.div.style;
  st.display = 'block';
  st.transform = style.transform || '';
  st.transformOrigin = style.origin || '50% 50%';
  st.opacity = style.opacity == null ? '' : style.opacity;
  st.clipPath = style.clip || '';
  st.zIndex = style.z || 1;
  if (!style.filter && camBlur) { mbCam.setAttribute('stdDeviation', `${camBlur[0].toFixed(1)} ${camBlur[1].toFixed(1)}`); st.filter = 'url(#mbCam)'; }
  else st.filter = style.filter || '';
  return ctx;
}

const f = 1 / FPS;
function activeAt(t) {
  const list = [];
  const i = SHOTS.findIndex(d => t >= d.start && t < d.end);
  const idx = i < 0 ? SHOTS.length - 1 : i;
  const cur = SHOTS[idx];
  list.push({ d: cur, role: 'cur' });
  const nxt = SHOTS[idx + 1];
  if (nxt && cur.out && t >= cur.end - (cur.out.pre || 0)) list.push({ d: nxt, role: 'in', tr: cur.out, T: cur.end });
  const prv = SHOTS[idx - 1];
  if (prv && prv.out && t < cur.start + (prv.out.post || 0)) list.push({ d: prv, role: 'out', tr: prv.out, T: cur.start });
  return list;
}

export function render(t) {
  resetFx();
  const act = activeAt(t);
  for (const s of runtime.values()) s.div.style.display = 'none';
  mbOut.setAttribute('stdDeviation', '0 0'); mbIn.setAttribute('stdDeviation', '0 0');
  const styles = new Map();
  for (const a of act) styles.set(a.d.id, { z: a.role === 'cur' ? 2 : 1 });
  // transición activa (a lo sumo una)
  const tr = act.find(a => a.role !== 'cur');
  if (tr) {
    const out = tr.role === 'in' ? act[0].d : tr.d;      // toma saliente
    const inn = tr.role === 'in' ? tr.d : act[0].d;      // toma entrante
    const so = styles.get(out.id), si = styles.get(inn.id);
    const o = tr.tr, Tc = tr.T, pre = o.pre || 0, post = o.post || 0;
    const a = pre ? clamp((t - (Tc - pre)) / pre) : 1;    // progreso antes del corte
    const bb = post ? clamp((t - Tc) / post) : 1;         // progreso después del corte
    const uu = clamp((t - (Tc - pre)) / Math.max(1e-6, pre + post));
    const before = t < Tc;
    switch (o.type) {
      case 'whip': {
        const dir = o.dir || 1, off = W * E.io(uu);
        const v = W * Math.PI / 2 * Math.sin(Math.PI * uu);   // ~velocidad
        const blur = Math.min(90, v / (pre + post) / FPS * 0.35);
        so.transform = `translateX(${-dir * off}px)`; si.transform = `translateX(${dir * (W - off)}px)`;
        so.z = 1; si.z = 2;
        mbOut.setAttribute('stdDeviation', `${blur} 0`); mbIn.setAttribute('stdDeviation', `${blur} 0`);
        so.filter = 'url(#mbOut)'; si.filter = 'url(#mbIn)';
        break;
      }
      case 'zoomflash': {
        const [px, py] = o.pt;
        if (before) { so.transform = `scale(${1 + 1.4 * E.in(a)})`; so.origin = `${px}px ${py}px`; so.z = 2; si.opacity = 0; FXSTATE.flash = E.in(a); FXSTATE.flashColor = o.color || '#dff0ff'; mbOut.setAttribute('stdDeviation', `${8 * a} ${8 * a}`); so.filter = 'url(#mbOut)'; }
        else { si.transform = `scale(${1.25 - 0.25 * E.out(bb)})`; si.z = 2; so.opacity = 0; FXSTATE.flash = 1 - E.out(bb); FXSTATE.flashColor = o.color || '#dff0ff'; }
        break;
      }
      case 'fadeblack': {
        if (before) { si.opacity = 0; FXSTATE.black = E.io(a); if (o.glow) { FXSTATE.glow = E.io(a) * o.glow.o; Object.assign(FXSTATE, { glowX: o.glow.x, glowY: o.glow.y, glowR: o.glow.r, glowColor: o.glow.c }); } }
        else { so.opacity = 0; }
        break;
      }
      case 'wipe': {
        const xb = lerp(-420, W + 420, E.io(a)), sl = 180;
        if (before) {
          si.z = 3; si.clip = `polygon(0 0, ${xb + sl}px 0, ${xb - sl}px ${H}px, 0 ${H}px)`;
          FXSTATE.band = { x: xb, sl, color: o.color || '#FFD23F', a };
        } else so.opacity = 0;
        break;
      }
      case 'ripple': {
        if (before) {
          const [px, py] = typeof o.pt === 'function' ? o.pt() : o.pt;
          const r = 2400 * E.in(a) + 8;
          si.z = 3; si.clip = `circle(${r}px at ${px}px ${py}px)`;
          FXSTATE.ring = { x: px, y: py, r, a, color: o.color || '#ffffff' };
        } else so.opacity = 0;
        break;
      }
      case 'doorblack': {
        if (before) { si.opacity = 0; FXSTATE.black = 0; FXSTATE.door = E.in(a); }
        else { so.opacity = 0; FXSTATE.black = 1 - E.out(bb); }
        break;
      }
      case 'dissolve': {
        si.z = 3; si.opacity = E.io(uu); if (!before && bb >= 1) so.opacity = 0;
        break;
      }
      case 'flash': {
        if (before) { si.opacity = 0; FXSTATE.flash = E.in(a) * (o.peak ?? 1); }
        else { so.opacity = 0; FXSTATE.flash = (1 - E.out(bb)) * (o.peak ?? 1); if (o.punch) si.transform = `scale(${1 + 0.07 * (1 - E.out(bb))})`; }
        FXSTATE.flashColor = o.color || '#ffffff';
        break;
      }
      default: { if (before) si.opacity = 0; else so.opacity = 0; }
    }
  }
  const ctxs = {};
  for (const a of act) {
    const s = runtime.get(a.d.id);
    if (!s) continue;
    const st = styles.get(a.d.id);
    if (st.opacity === 0) { s.div.style.display = 'none'; continue; }
    ctxs[a.d.id] = renderShot(s, t - a.d.start, st);
  }
  // efectos globales
  fx.black.style.opacity = FXSTATE.black;
  fx.flash.style.opacity = FXSTATE.flash; fx.flash.style.background = FXSTATE.flashColor;
  fx.glow.style.opacity = FXSTATE.glow;
  fx.glow.style.background = `radial-gradient(circle ${FXSTATE.glowR}px at ${FXSTATE.glowX}px ${FXSTATE.glowY}px, rgba(${FXSTATE.glowColor},0.95), rgba(${FXSTATE.glowColor},0.25) 45%, rgba(${FXSTATE.glowColor},0) 100%)`;
  fx.tint.style.opacity = FXSTATE.tint; fx.tint.style.background = `rgb(${FXSTATE.tintColor})`; fx.tint.style.mixBlendMode = FXSTATE.tintBlend;
  if (FXSTATE.door != null) { fx.black.style.opacity = 1; fx.black.style.clipPath = `inset(0 0 0 ${W * (1 - FXSTATE.door)}px)`; }
  else fx.black.style.clipPath = '';
  if (FXSTATE.band) {
    const { x, sl, color, a } = FXSTATE.band;
    fx.band.style.display = 'block';
    fx.band.style.clipPath = `polygon(${x - 70 + sl}px 0, ${x + 70 + sl}px 0, ${x + 70 - sl}px ${H}px, ${x - 70 - sl}px ${H}px)`;
    fx.band.style.background = color; fx.band.style.opacity = Math.sin(Math.PI * clamp(a * 1.1)) * 0.95;
  } else fx.band.style.display = 'none';
  if (FXSTATE.ring) {
    const { x, y, r, a, color } = FXSTATE.ring;
    fx.ring.style.display = 'block';
    fx.ringC.setAttribute('cx', x); fx.ringC.setAttribute('cy', y); fx.ringC.setAttribute('r', r);
    fx.ringC.setAttribute('stroke', color); fx.ringC.setAttribute('stroke-width', 40 * (1 - a) + 6); fx.ringC.setAttribute('opacity', 0.9 * (1 - a * 0.6));
  } else fx.ring.style.display = 'none';
  return { t, shots: act.map(a => a.d.id) };
}

// Posición de corte/tiempos para herramientas
export function schedule() { return SHOTS.map(d => ({ id: d.id, start: d.start, end: d.end, beats: d.beats, b0: d.b0 })); }
