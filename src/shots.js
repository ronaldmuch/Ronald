// Dirección de cada toma según el "Animática · Plan de animación".
// Tiempos en segundos reales desde el inicio de la toma (ctx.t). ctx.F(x) convierte tiempos de Figma.
// Las cámaras usan los rectángulos "Cámara A/B/C/D" del plan (miniatura 768×432 → ×2.5).
import { FPS, BEAT, W, H, E, clamp, lerp, prog, keys, fbm, noise1, camAt, camMatrix, apply, T, S, R, chain } from './engine.js';

const f = 1 / FPS;
const B = BEAT;
export const TAIL = 1.4;           // cola final (negro + resonancia del chime)
const r25 = r => r.map(v => v * 2.5); // miniatura → 1920
const FULL = [0, 0, 1920, 1080];

// ───────── helpers de animación ─────────
function pop(c, t, t0, d = 0.32, from = 0, ease = E.outBack) {
  if (!c) return;
  const p = clamp((t - t0) / d);
  const s = t < t0 ? from : lerp(from, 1, ease(p));
  c.sx *= s; c.sy *= s;
  c.o = t < t0 ? 0 : clamp(p * 3);
}
function hideUntil(c, t, t0) { if (c && t < t0) c.o = 0; }
function blink(eyes, t, times) {
  for (const tb of times) {
    const i = Math.floor((t - tb) / f);
    if (i >= 0 && i < 5) { const v = [0.5, 0.08, 0.08, 0.45, 0.9][i]; for (const e of eyes) if (e) e.sy *= v; }
  }
}
function breathe(c, t, period = 4, amp = 0.012, phase = 0) {
  if (!c) return; c.pivot = c.pivot || 'bc';
  c.sy *= 1 + amp * (0.5 - 0.5 * Math.cos(2 * Math.PI * (t / period + phase)));
}
function bob(c, t, amp = 5, period = 2, phase = 0) { if (c) c.ty += Math.sin(2 * Math.PI * (t / period + phase)) * amp; }
function eyesOf(ctx, charName) {
  const ch = ctx.el(charName); if (!ch) return [];
  return [...ctx.s.findAll('Ojo L', ch), ...ctx.s.findAll('Ojo R', ch)].map(e => ctx.c(e));
}
function press(c, t, t0, amt = 0.94, d = 0.18) {
  if (!c) return; const p = (t - t0) / d; if (p < 0 || p > 1) return;
  const s = 1 - (1 - amt) * Math.sin(Math.PI * p); c.sx *= s; c.sy *= s;
}
function flashEl(ctx, key, box, t, t0, d = 0.35, color = '#ffffff', maxO = 0.55, rx = 18) {
  let r = ctx.s.state[key];
  if (!r) { r = ctx.s.make('rect', { rx, fill: color, opacity: 0 }); ctx.s.state[key] = r; }
  const [x, y, w, h] = box; r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', w); r.setAttribute('height', h);
  const p = (t - t0) / d; r.setAttribute('opacity', p < 0 || p > 1 ? 0 : (maxO * (1 - p) * Math.min(1, p * 6)).toFixed(3));
}
// Chip propio (mismo lenguaje visual que los chips del diseño: píldora blanca, texto Inter)
function makeChip(s, text, { x, y, h = 53, fs = 24, color = '#0F1B4C', bg = '#ffffff', dot = '#22C55E', parent } = {}) {
  const g = s.make('g', {}, parent);
  const tmp = s.make('text', { 'font-family': 'Inter', 'font-weight': 700, 'font-size': fs }, g); tmp.textContent = text;
  const tw = tmp.getComputedTextLength(); tmp.remove();
  const pad = 22, dotW = dot ? 26 : 0, w = tw + pad * 2 + dotW;
  s.make('rect', { x: 0, y: 3, width: w, height: h, rx: h / 2, fill: 'rgba(8,16,60,0.25)' }, g);
  s.make('rect', { x: 0, y: 0, width: w, height: h, rx: h / 2, fill: bg }, g);
  if (dot) s.make('circle', { cx: pad + 7, cy: h / 2, r: 7, fill: dot }, g);
  const tx = s.make('text', { x: pad + dotW, y: h / 2 + fs * 0.36, 'font-family': 'Inter', 'font-weight': 700, 'font-size': fs, fill: color }, g);
  tx.textContent = text;
  g.setAttribute('opacity', 0);
  return { g, w, h, x, y, set(t, t0, dur = 0.32) { // pop con overshoot
    const p = clamp((t - t0) / dur); const sc = t < t0 ? 0.001 : E.outBack(p);
    g.setAttribute('opacity', t < t0 ? 0 : clamp(p * 3)); g.setAttribute('transform', `translate(${x + w / 2} ${y + h / 2}) scale(${sc}) translate(${-w / 2} ${-h / 2})`);
  } };
}
function strike(s, key, box, color = '#E5484D', parent) {
  let l = s.state[key];
  if (!l) { const [x, y, w, h] = box; l = s.make('line', { x1: x - 6, y1: y + h * 0.55, x2: x + w + 6, y2: y + h * 0.48, stroke: color, 'stroke-width': Math.max(6, h * 0.12), 'stroke-linecap': 'round', 'stroke-dasharray': `${w + 12} ${w + 12}`, 'stroke-dashoffset': w + 12, opacity: 0.95 }, parent); l._len = w + 12; s.state[key] = l; }
  return p => { l.setAttribute('stroke-dashoffset', (l._len * (1 - clamp(p))).toFixed(1)); l.setAttribute('opacity', p <= 0 ? 0 : 0.95); };
}
function pulseDot(s, key, parent, color = '#FFD23F', r = 16) {
  let g = s.state[key];
  if (!g) {
    g = s.make('g', { opacity: 0 }, parent);
    s.make('circle', { r: r * 3.2, fill: color, opacity: 0.18 }, g);
    s.make('circle', { r: r * 1.8, fill: color, opacity: 0.35 }, g);
    s.make('circle', { r, fill: '#ffffff' }, g);
    s.state[key] = g;
  }
  return (x, y, o) => { g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`); g.setAttribute('opacity', o.toFixed(3)); };
}
const center = b => [b[0] + b[2] / 2, b[1] + b[3] / 2];
const qbez = (p0, p1, p2, u) => [(1 - u) * (1 - u) * p0[0] + 2 * (1 - u) * u * p1[0] + u * u * p2[0], (1 - u) * (1 - u) * p0[1] + 2 * (1 - u) * u * p1[1] + u * u * p2[1]];

// Montaje 02–10: número con pop en el downbeat, titular 3 cuadros después
function montageUpdate(extra) {
  return ctx => {
    const { t } = ctx;
    const n = ctx.c('Número');
    if (n) { n.o = null; const p = clamp(t / 0.3); const s = t < 0 ? 0 : keys(t, [[0, 0.2], [0.14, 1.14, E.out], [0.3, 1, E.io]]); n.sx *= s; n.sy *= s; n.o = clamp(t / 0.06); n.pivot = 'cc'; }
    extra && extra(ctx);
  };
}

// ───────── cues de sonido por toma: [t, nombre, opciones] ─────────
// (el mezclador añade además los sonidos de cada transición)

export const SHOTS = [
  // ═════════════ ACTO 1 · EL CAOS ═════════════
  {
    id: '01', beats: 9, cameraLayer: 'Plano (cámara)',
    cam: [{ t: 0, r: FULL }, { t: 4.9, r: r25([225.7, 33.7, 548.6, 308.6]) }],
    camMod: (cam, t) => { // cada notificación empuja la cámara 1 % extra, como un latido
      let k = 0; for (const tn of [0.8, 1.46, 2.12, 2.78, 3.44]) if (t >= tn) k += 0.012 * (1 - Math.exp(-(t - tn) * 18)) + 0.01 * Math.exp(-(t - tn) * 7);
      return { ...cam, z: cam.z * (1 + k) };
    },
    shakes: [[0.8, 0.35], [1.46, 0.35], [2.12, 0.35], [2.78, 0.35], [3.44, 0.6]],
    update(ctx) {
      const { t } = ctx;
      const cab = ctx.c('Cabeza'), len = ctx.c('Lentes'), ron = ctx.c('Ronald · primer plano');
      // beat 2: bostezo (Figma abre la boca 1.5–2.7) → cabeza atrás y hombros arriba
      if (cab) { cab.r += keys(t, [[1.3, 0], [1.75, -3.5, E.out], [2.6, -3.5], [3.0, 0, E.io]]); cab.pivot = 'bc'; }
      if (ron) { ron.ty += keys(t, [[1.3, 0], [1.7, -10, E.out], [2.6, -10], [3.0, 0]]); }
      // beat 3: se frota el ojo → los lentes se levantan y caen con retraso
      if (len) len.ty += keys(t, [[2.95, 0], [3.1, -16, E.out], [3.3, -16], [3.42, 3, E.in], [3.52, 0, E.out]]);
      // beat 4: nueva notificación → micro-sobresalto (cejas 2 cuadros, hombros)
      for (const nm of ['Ceja L', 'Ceja R']) { const c = ctx.c(nm); if (c) c.ty += keys(t, [[3.44, 0], [3.48, -14, E.out], [3.56, -14], [3.75, 0]]); }
      if (ron) ron.ty += keys(t, [[3.44, 0], [3.5, -9, E.out], [3.7, 0, E.io]]);
      // notificaciones: rebotan al apilarse y empujan a las de abajo
      const notes = ctx.cAll('Notificación');
      const land = [0.8, 1.46, 2.12, 2.78, 3.44];
      notes.forEach((c, i) => { for (let j = i + 1; j < land.length; j++) { const dt = t - land[j]; if (dt > 0 && dt < 0.3) c.ty += Math.sin(dt / 0.3 * Math.PI) * 7; } });
      // la luz azul del celular pulsa con cada mensaje (además de Figma)
      const luz = ctx.c('Luz del celular');
      if (luz) { let k = 0; for (const tn of land) { const dt = t - tn + 0.05; if (dt > 0) k += Math.exp(-dt * 5) * 0.35; } luz.oMul = 1 + k; }
      // final: la pantalla del celular crece → match cut
    },
    out: { type: 'zoomflash', pre: 8 * f, post: 5 * f, pt: [1760, 540], color: '#cfe6ff' },
    sfx: [
      [0, 'room_night', { dur: 5.0, gain: 0.5 }],
      [0.05, 'breath_tired', { gain: 0.7 }], [2.0, 'breath_tired', { gain: 0.6 }],
      ...[0.5, 1.16, 1.82, 2.48, 3.14, 3.8, 4.4].map((tt, i) => [tt, 'vibrate', { gain: 0.8, pan: 0.35 }]),
      ...[0.8, 1.46, 2.12, 2.78, 3.44].map((tt, i) => [tt, 'notif', { gain: 0.55, pan: -0.45, pitch: 1 + i * 0.02 }]),
      [1.5, 'yawn', { gain: 0.8 }],
      [3.45, 'startle', { gain: 0.5 }],
      [2.6, 'sweat', { gain: 0.35 }],
    ],
  },
  { id: '02', beats: 2, update: montageUpdate(ctx => {
      // scroll con el pulgar: la lista del chat sube
      const chat = ctx.c('Chat'); if (chat) chat.ty += -keys(ctx.t, [[0, 0], [0.3, 60, E.out], [0.55, 60], [0.85, 140, E.out]]);
    }), out: { type: 'whip', dir: 1, pre: 3 * f, post: 3 * f },
    sfx: [[0, 'num_hit', {}], [0.05, 'notif', { gain: 0.35, pan: 0.3 }], [0.25, 'notif', { gain: 0.3, pan: -0.2, pitch: 1.06 }], [0.45, 'vibrate', { gain: 0.4 }], [0.6, 'notif', { gain: 0.3, pan: 0.5, pitch: 0.95 }], [0.3, 'thumb_scroll', { gain: 0.5 }], [0.75, 'thumb_scroll', { gain: 0.45 }]] },
  { id: '03', beats: 2, update: montageUpdate(ctx => {
      const scr = ctx.c('Pantalla · Sistrack Crear Orden'); flashEl(ctx, 'crear', [1330, 400, 170, 60], ctx.t, 0.72, 0.25, '#ffffff', 0.6, 10);
    }), out: { type: 'whip', dir: -1, pre: 3 * f, post: 3 * f },
    sfx: [[0, 'num_hit', {}], [0.08, 'keyboard', { dur: 0.6, gain: 0.55 }], [0.72, 'click', { gain: 0.7 }], [0.85, 'ding_ui', { gain: 0.35 }]] },
  { id: '04', beats: 2, update: montageUpdate(ctx => {
      flashEl(ctx, 'fila', [640, 555, 620, 40], ctx.t, 0.3, 0.3, '#fff6a8', 0.55, 4);
      flashEl(ctx, 'fila2', [640, 600, 620, 40], ctx.t, 0.7, 0.3, '#fff6a8', 0.55, 4);
    }), out: { type: 'whip', dir: 1, pre: 3 * f, post: 3 * f },
    sfx: [[0, 'num_hit', {}], [0.25, 'click', { gain: 0.6 }], [0.4, 'copy_paste', { gain: 0.6 }], [0.7, 'click', { gain: 0.55, pitch: 1.05 }], [0.82, 'copy_paste', { gain: 0.55 }]] },
  { id: '05', beats: 2, update: montageUpdate(), out: { type: 'whip', dir: -1, pre: 3 * f, post: 3 * f },
    sfx: [[0, 'num_hit', {}], [0.05, 'keyboard', { dur: 0.45, gain: 0.6 }], [0.55, 'enter_key', { gain: 0.7 }], [0.78, 'enter_key', { gain: 0.7 }]] },
  { id: '06', beats: 2, update: montageUpdate(ctx => {
      const { t } = ctx;
      // "Error: NIT inválido" → parpadeo rojo del aviso
      flashEl(ctx, 'err', [620, 800, 690, 44], t, 0.5, 0.45, '#ff5a5a', 0.4, 8);
    }), out: { type: 'whip', dir: 1, pre: 3 * f, post: 3 * f },
    sfx: [[0, 'num_hit', {}], [0.05, 'keyboard', { dur: 0.4, gain: 0.55 }], [0.5, 'error', { gain: 0.6 }], [0.78, 'sigh', { gain: 0.55 }]] },
  { id: '07', beats: 2, update: montageUpdate(), out: { type: 'whip', dir: -1, pre: 3 * f, post: 3 * f },
    sfx: [[0, 'num_hit', {}], [0.05, 'phone_type', { dur: 0.5, gain: 0.55 }], [0.62, 'send', { gain: 0.55 }], [0.85, 'notif', { gain: 0.3, pan: 0.4 }]] },
  { id: '08', beats: 2, update: montageUpdate(ctx => {
      const cap = ctx.c('Captura'); if (cap) { const z = keys(ctx.t, [[0.35, 1], [0.7, 1.18, E.out]]); cap.sx *= z; cap.sy *= z; }
    }), out: { type: 'whip', dir: 1, pre: 3 * f, post: 3 * f },
    sfx: [[0, 'num_hit', {}], [0.1, 'img_ding', { gain: 0.5 }], [0.4, 'pinch', { gain: 0.4 }], [0.7, 'refresh', { gain: 0.45 }]] },
  { id: '09', beats: 2, update: montageUpdate(ctx => {
      flashEl(ctx, 'verde', [1290, 690, 120, 40], ctx.t, 0.45, 0.5, '#4ade80', 0.5, 4);
    }), out: { type: 'whip', dir: -1, pre: 3 * f, post: 3 * f },
    sfx: [[0, 'num_hit', {}], [0.3, 'click', { gain: 0.6 }], [0.48, 'cell_fill', { gain: 0.5 }], [0.75, 'click', { gain: 0.5 }]] },
  {
    id: '10', beats: 3,
    // corre normal y se congela en "Compras: —" (8 cuadros de silencio + golpe grave en el corte)
    timeMap: (t, ctx) => Math.min(t, 1.28),
    update: montageUpdate(ctx => {
      const { t } = ctx;
      if (t >= 1.28) { ctx.fx.tint = 0.18; ctx.fx.tintColor = '20,20,40'; ctx.fx.tintBlend = 'multiply'; for (const nm of ['Titular', 'Número', '¿Cuáles de estos chats compraron? 🤷']) { const c = ctx.c(nm); if (c) c.oMul = 0; } }
    }),
    // la cámara empuja y se congela en seco sobre "Compras: —"
    setup(ctx) { const b = ctx.bbox('Sin datos de venta'); const w = Math.max(b[2], b[3] * 16 / 9) * 1.9; const h = w * 9 / 16; ctx.d.cam = [{ t: 0, r: FULL }, { t: 1.28, r: [960 - 960 / 1.08, 540 - 540 / 1.08, 1920 / 1.08, 1080 / 1.08] }, { t: 1.28 + 1e-3, r: [b[0] + b[2] / 2 - w / 2, b[1] + b[3] / 2 - h / 2, w, h], e: E.linear }]; ctx.d.stillAfter = 1.28; },
    out: { type: 'cut' },
    sfx: [[0, 'num_hit', {}], [0.25, 'click', { gain: 0.6 }], [0.9, 'click', { gain: 0.4, pitch: 0.9 }], [1.28, 'freeze_hit', { gain: 0.6 }]],
  },
  {
    id: '11', beats: 8,
    cam: [{ t: 0, r: r25([224, 174, 320, 180]) }, { t: 0.3, r: r25([224, 174, 320, 180]) }, { t: 4.3, r: FULL }],
    shakes: [[0.667, 1], [1.4, 1], [2.133, 1], [2.867, 1.3]],
    update(ctx) {
      const { t } = ctx;
      const imp = [0.667, 1.4, 2.133, 2.867];
      const ron = ctx.c('Dueño · picado');
      if (ron) {
        ron.pivot = 'bc';
        for (const ti of imp) { const dt = t - ti; if (dt >= 0 && dt < 0.4) { const s = 1 - 0.05 * Math.sin(Math.PI * clamp(dt / 0.3)) * Math.exp(-dt * 3); ron.sy *= s; ron.sx *= 2 - s; } }
        if (t > 2.867) { ron.sy *= 1 - 0.04 * prog(t, 2.867, 3.1, E.out); ron.sx *= 1 + 0.02 * prog(t, 2.867, 3.1); }
      }
      // mira hacia cada tarjeta (la mirada llega antes que la cabeza)
      const cab = ctx.c(ctx.s.findAll('Cabeza')[0]);
      const dirs = [-1, 1, -1, 1];
      if (cab) { cab.pivot = 'bc'; let r = 0; imp.forEach((ti, i) => { r = lerp(r, dirs[i] * 6, prog(t, ti - 0.2, ti + 0.05, E.out)); }); cab.r += r; }
      const eyes = eyesOf(ctx, 'Dueño · picado');
      let ex = 0; imp.forEach((ti, i) => { ex = lerp(ex, dirs[i] * 5, prog(t, ti - 0.35, ti - 0.15, E.out)); });
      eyes.forEach(e => { if (e) e.tx += ex; });
      blink(eyes, t, [0.2, 1.75, 3.4]);
      // pulso rojo en cada impacto
      let red = 0; for (const ti of imp) { const dt = t - ti; if (dt > 0) red += Math.exp(-dt * 6) * 0.25; }
      ctx.fx.tint = Math.min(0.35, red); ctx.fx.tintColor = '255,40,40'; ctx.fx.tintBlend = 'multiply';
    },
    out: { type: 'fadeblack', pre: 6 * f, glow: { x: 960, y: 560, r: 150, c: '90,160,255', o: 0.9 } },
    sfx: [
      [0, 'boom_low', { gain: 1.0 }],
      ...[0.667, 1.4, 2.133, 2.867].map((tt, i) => [tt - 0.33, 'fall_whoosh', { gain: 0.35, pan: [-0.5, 0.5, -0.5, 0.5][i] }]),
      ...[0.667, 1.4, 2.133, 2.867].map((tt, i) => [tt, 'register_thud', { gain: 0.85, pitch: [1, 0.86, 0.74, 0.62][i], pan: [-0.4, 0.4, -0.4, 0.4][i] }]),
      [3.2, 'sigh', { gain: 0.5 }],
    ],
  },
  // ═════════════ ACTO 2 · URBBY TRABAJA ═════════════
  {
    id: '12', beats: 9,
    cam: [
      { t: 0, r: r25([30.1, 128.9, 451.8, 254.1]) }, { t: 0.9, r: r25([30.1, 128.9, 451.8, 254.1]) },
      { t: 1.45, r: FULL, e: E.out }, { t: 1.95, r: FULL },
      { t: 4.55, r: r25([292, 33, 480, 270]) },
    ],
    update(ctx) {
      const { t } = ctx;
      // desde el negro: flash amarillo sobre la mascota
      ctx.fx.black = 1 - prog(t, 0, 0.12, E.linear);
      ctx.fx.flash = keys(t, [[0, 0], [0.12, 0.9, E.out], [0.7, 0, E.io]]); ctx.fx.flashColor = '#FFE27A';
      ctx.fx.tint = prog(t, 0.2, 1.2) * 0.22; ctx.fx.tintColor = '255,170,60'; ctx.fx.tintBlend = 'soft-light';
      // Urbby AI: sale del celular en arco desde abajo, gira una vez y frena con overshoot
      const u = ctx.c('Urbby AI');
      if (u) {
        u.ty += keys(t, [[0, 420], [0.85, 0, E.out]]);
        u.r += keys(t, [[0, -360], [0.9, 0, E.out]]);
        // el visor "mira" a Ronald
        const lin = ctx.c(ctx.s.findAll('Visor/Línea')[0]); if (lin) lin.tx += keys(t, [[1.3, 0], [1.6, 26, E.outBack], [3.6, 26], [3.9, 0]]);
        const cur = ctx.c(ctx.s.findAll('Visor/Cursor')[0]); if (cur) cur.o = (Math.floor(t * 3) % 2 === 0) ? 1 : 0.2;
      }
      // Ronald: anticipación hacia atrás, hold con la boca en O, primer respiro profundo
      const ron = ctx.c('Ronald · plano medio');
      if (ron) {
        ron.tx += keys(t, [[0.15, 0], [0.4, 22, E.out], [1.4, 22], [2.1, 4, E.io]]);
        ron.ty += keys(t, [[2.2, 0], [2.9, -8, E.io], [3.7, 5, E.io], [4.4, 3]]);
        breathe(ron, t, 3.2, 0.008);
      }
      const eyes = eyesOf(ctx, 'Ronald · plano medio'); blink(eyes, t, [2.45, 4.1]);
      // chispas flotan
      ctx.cAll('Chispa').forEach((c, i) => { c.ty += -t * (10 + i * 4); c.oMul = 0.6 + 0.4 * Math.abs(Math.sin(t * 3 + i)); });
      ctx.cAll('Rayo').forEach((c, i) => { c.oMul = 1 - prog(t, 1.2, 2.6) * 0.75; });
    },
    out: { type: 'wipe', pre: 11 * f, color: '#FFD23F' },
    sfx: [
      [0.0, 'flash_boom', { gain: 0.9 }], [0.05, 'chime_up', { gain: 0.8 }],
      [0.1, 'mascot_fly', { gain: 0.6, pan: -0.3 }],
      [0.35, 'surprise_gasp', { gain: 0.45 }],
      [1.6, 'visor_blip', { gain: 0.45 }],
      [2.3, 'breath_relief', { gain: 0.6 }],
    ],
  },
  {
    id: '13', beats: 7,
    cam: [
      { t: 0, r: r25([2, 69.7, 548.6, 308.6]) }, { t: 0.4, r: r25([2, 69.7, 548.6, 308.6]) },
      { t: 1.5, r: r25([139.6, 48, 568.9, 320]) },
      { t: 1.75, r: r25([139.6, 48, 568.9, 320]) }, { t: 2.3, r: r25([316, 190, 320, 180]) },
    ],
    setup(ctx) { ctx.s.state.rack = ctx.s.blurFilter('rack'); const p = ctx.el('Personaje de espaldas'); if (p) p.setAttribute('filter', `url(#${ctx.s.state.rack.id})`); },
    update(ctx) {
      const { t } = ctx;
      ctx.s.state.rack.set(prog(t, 0.4, 1.5) * 7);   // rack focus: la nuca se desenfoca
      const cre = ctx.c('Creativo');                  // scroll del feed ×2 con ease-out
      if (cre) cre.ty += keys(t, [[0, 300], [0.35, 300], [0.62, 130, E.out], [0.85, 130], [1.12, 0, E.out]]);
      const mano = ctx.c('Mano cliente');
      if (mano) { mano.ty += keys(t, [[0.2, 0], [0.32, -26, E.out], [0.5, 0], [0.7, -26, E.out], [0.9, 0]]); }
      const per = ctx.c('Personaje de espaldas'); if (per) { per.r += keys(t, [[1.15, 0], [1.6, 3, E.io]]); per.pivot = 'bc'; }
      const tel = ctx.c('Teléfono'); if (tel) { const z = keys(t, [[1.25, 1], [1.8, 1.05, E.io]]); tel.sx *= z; tel.sy *= z; }
      press(ctx.c('CTA · Enviar mensaje'), t, 2.43, 0.9, 0.2);
    },
    out: { type: 'ripple', pre: 10 * f, color: '#ffffff', pt: () => { const cam = camAt(10, SHOTS_BY.get('13').cam); return apply(camMatrix(cam), 1189, 698); } },
    sfx: [[0, 'day_amb', { dur: 3.9, gain: 0.35 }], [0.3, 'swipe', { gain: 0.55 }], [0.7, 'swipe', { gain: 0.5 }], [1.6, 'hmm_interest', { gain: 0.0 }], [2.43, 'tap_pop', { gain: 0.8 }]],
  },
  {
    id: '14', beats: 7,
    cam: [
      { t: 0, r: r25([160, 2, 480, 270]) }, { t: 0.45, r: r25([160, 2, 480, 270]) },
      { t: 2.25, r: r25([115.6, 64, 568.9, 320]) },
      { t: 2.45, r: r25([115.6, 64, 568.9, 320]) }, { t: 3.35, r: r25([344, 160, 512, 288]) },
    ],
    setup(ctx) {
      const s = ctx.s; const u = ctx.el('Urbby AI'); const v = ctx.s.find('Visor', u); const b = v.getBBox();
      const g = s.make('g', {}, u.parentNode); s.state.dots = [];
      for (let i = 0; i < 3; i++) s.state.dots.push(s.make('circle', { cx: b.x + b.width / 2 + (i - 1) * b.width * 0.16, cy: b.y + b.height / 2, r: b.height * 0.13, fill: '#7ef9ff' }, g));
      s.state.dotsG = g;
    },
    update(ctx) {
      const { t } = ctx;
      // "escribiendo…" en el visor de la mascota, luego la respuesta sale del visor y viaja al chat
      const typing = t > 0.45 && t < 1.05;
      ctx.s.state.dots.forEach((d, i) => d.setAttribute('opacity', typing ? (0.35 + 0.65 * Math.max(0, Math.sin((t * 6 - i * 0.6) * Math.PI))) : 0));
      const u = ctx.c('Urbby AI'); if (u) ctx.s.state.dotsG.setAttribute('transform', u.g.getAttribute('transform') || '');
      const bubs = ctx.cAll('Burbuja');
      const reply = bubs[1];
      // la respuesta sale del visor como un paquete de luz que viaja por la ruta punteada…
      const pk = pulseDot(ctx.s, 'pk14', null, '#7ef9ff', 12);
      const tA = 1.0, tB = 1.42;
      const u2 = prog(t, tA, tB, E.io);
      const [px, py] = qbez([1690, 880], [1560, 560], [1400, 600], u2);
      pk(px, py, t > tA && t < tB + 0.04 ? 1 : 0);
      // …y la burbuja aparece en su lugar con rebote
      if (reply) { reply.o = null; reply.pivot = 'cr'; pop(reply, t, tB - 0.02, 0.34, 0.55); }
      // el chip "Respondido en 3 s" entra en el beat
      const chip = ctx.c('Chip · Respondido en 3 s'); if (chip) { chip.sx = chip.sy = 1; pop(chip, t, 3 * B); }
    },
    out: { type: 'cut' },
    sfx: [[0.05, 'msg_in', { gain: 0.6, pan: -0.2 }], [0.4, 'mascot_in', { gain: 0.45, pan: 0.5 }], [0.5, 'typing_dots', { dur: 0.5, gain: 0.45, pan: 0.4 }], [1.0, 'bubble_travel', { gain: 0.5, pan: 0.2 }], [1.45, 'reply_pop', { gain: 0.7 }], [3 * B, 'chip_pop', { gain: 0.5, pan: -0.5 }], [1.7, 'msg_in', { gain: 0.35, pan: -0.2, pitch: 0.95 }]],
  },
  {
    id: '14b', beats: 4, cameraLayer: 'Plano (cámara)',
    cam: [{ t: 0, r: FULL }, { t: 2.22, r: r25([76.8, 67.2, 614.4, 345.6]) }],
    update(ctx) {
      const { t } = ctx;
      const luz = ctx.c('Luz del celular'); if (luz) luz.o = keys(t, [[0, 0.25], [0.45, 0.25], [0.55, 0.75, E.out], [1.4, 0.35, E.io], [2.2, 0.3]]);
      const mano = ctx.c('Mano L'); if (mano) { const v = t > 0.45 && t < 0.95 ? Math.sin(t * 150) * 3 : 0; mano.tx += v; }
      const ron = ctx.c('Ronald · primer plano'); if (ron) { ron.ty += keys(t, [[1.0, 0], [1.35, 6, E.io], [1.7, 2, E.io]]); breathe(ron, t, 3.4, 0.006); }
      const chip = ctx.s.state.chip; if (chip) chip.set(t, 0.55);
      ctx.fx.tint = 0.12; ctx.fx.tintColor = '255,190,120'; ctx.fx.tintBlend = 'soft-light';
    },
    setup(ctx) { ctx.s.state.chip = makeChip(ctx.s, 'Urbby AI respondió ✓', { x: 1265, y: 58, fs: 30, h: 64, dot: '#FFD23F' }); },
    out: { type: 'cut' },
    sfx: [[0, 'room_night', { dur: 2.3, gain: 0.35 }], [0.5, 'vibrate_soft', { gain: 0.55, pan: 0.3 }], [0.58, 'notif_soft', { gain: 0.35, pan: 0.3 }], [0.1, 'sleep_breath', { gain: 0.55 }]],
  },
  {
    id: '15', beats: 5,
    cam: [{ t: 0, r: r25([158.1, 72.9, 451.8, 254.1]) }, { t: 0.25, r: r25([158.1, 72.9, 451.8, 254.1]) }, { t: 2.25, r: FULL }],
    update(ctx) {
      const { t } = ctx;
      const vis = ctx.el('Urbby AI · visor');
      const lin = vis && ctx.c(ctx.s.find('Visor/Línea', vis));
      if (lin) lin.tx += keys(t, [[0, -260], [0.42, -80, E.out], [0.75, -80], [1.05, 220, E.out], [1.45, 220], [2.0, 0, E.io]]);
      const ads = ctx.c('Ads Manager'), inv = ctx.c('Inventario');
      flashEl(ctx, 'fAds', [90, 190, 860, 400], t, 0.45, 0.35, '#ffffff', 0.45, 24);
      flashEl(ctx, 'fInv', [1280, 120, 440, 513], t, 1.08, 0.35, '#ffffff', 0.45, 24);
      if (ads) { const z = keys(t, [[0.42, 1], [0.5, 1.03, E.out], [0.7, 1]]); ads.sx *= z; ads.sy *= z; }
      if (inv) { const z = keys(t, [[1.05, 1], [1.13, 1.03, E.out], [1.33, 1]]); inv.sx *= z; inv.sy *= z; }
    },
    out: { type: 'cut' },
    sfx: [[0.05, 'scan', { dur: 2.0, gain: 0.5 }], [0.3, 'holo_open', { gain: 0.5, pan: -0.4 }], [0.45, 'bip', { gain: 0.55, pan: -0.4 }], [0.95, 'holo_open', { gain: 0.45, pan: 0.5 }], [1.08, 'bip', { gain: 0.55, pan: 0.5, pitch: 1.25 }], [0.4, 'chip_pop', { gain: 0.35, pan: -0.5 }], [0.85, 'chip_pop', { gain: 0.35, pan: 0.5 }]],
  },
  {
    id: '16', beats: 9,
    cam: [
      { t: 0, r: r25([78.1, 64.9, 451.8, 254.1]) }, { t: 0.95, r: r25([78.1, 64.9, 451.8, 254.1]) },
      { t: 1.35, r: r25([304.6, 49.8, 590.8, 332.3]), e: E.io },
      { t: 2.6, r: r25([304.6, 49.8, 590.8, 332.3]) }, { t: 3.0, r: r25([457, 250.1, 333.9, 187.8]) },
    ],
    setup(ctx) {
      const s = ctx.s; const bt = ctx.el('Botón Pagar'); const b = bt.getBBox();
      const g = s.make('g', { opacity: 0 }, bt.parentNode);
      s.make('rect', { x: b.x, y: b.y, width: b.width, height: b.height, rx: b.height / 2, fill: '#16a34a' }, g);
      const cx = b.x + b.width / 2, cy = b.y + b.height / 2, r = b.height * 0.28;
      const arc = s.make('circle', { cx, cy, r, fill: 'none', stroke: '#fff', 'stroke-width': b.height * 0.09, 'stroke-linecap': 'round', 'stroke-dasharray': `${r * 4} ${r * 7}` }, g);
      const chk = s.make('path', { d: `M ${cx - r * 0.9} ${cy + r * 0.05} L ${cx - r * 0.2} ${cy + r * 0.75} L ${cx + r * 1.0} ${cy - r * 0.7}`, fill: 'none', stroke: '#fff', 'stroke-width': b.height * 0.12, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-dasharray': r * 4, 'stroke-dashoffset': r * 4 }, g);
      Object.assign(s.state, { spin: g, arc, chk, cx, cy, r });
    },
    update(ctx) {
      const { t } = ctx; const st = ctx.s.state;
      const ops = ctx.cAll('Opción'); press(ops[1] || ops[0], t, 0.72, 0.93, 0.2);
      const wv = ctx.c('Teléfono · web view Urbby Pay'); press(wv, t, 3.45, 0.98, 0.25);
      // "Procesando…" spinner 0.6 s → se convierte en ✓
      st.spin.setAttribute('opacity', t >= 3.5 ? 1 : 0);
      st.arc.setAttribute('opacity', t < 4.12 ? 1 : 0);
      st.arc.setAttribute('transform', `rotate(${(t - 3.5) * 720} ${st.cx} ${st.cy})`);
      st.chk.setAttribute('stroke-dashoffset', (st.r * 4 * (1 - prog(t, 4.12, 4.35, E.out))).toFixed(1));
      if (t > 4.5) { const z = 1 + 2.5 * prog(t, 4.5, 5.0, E.in); st.spin.setAttribute('transform', `translate(${st.cx} ${st.cy}) scale(${z}) translate(${-st.cx} ${-st.cy})`); }
      else st.spin.removeAttribute('transform');
    },
    camMotionBlur: [[0.95, 1.35]],
    out: { type: 'flash', pre: 2 * f, post: 5 * f, color: '#ffffff', punch: true },
    sfx: [[0.72, 'tap_soft', { gain: 0.6, pan: -0.3 }], [0.95, 'whip', { gain: 0.6 }], [1.05, 'sheet_up', { gain: 0.6, pan: 0.2 }], [1.9, 'keypad', { dur: 1.0, gain: 0.4, pan: 0.2 }], [3.2, 'lock', { gain: 0.5, pan: 0.3 }], [3.45, 'tap_firm', { gain: 0.8, pan: 0.3 }], [3.5, 'processing', { dur: 0.6, gain: 0.4 }], [4.12, 'success_tick', { gain: 0.6 }]],
  },
  {
    id: '17', beats: 6,
    cam: [{ t: 0, r: r25([175.6, 64, 568.9, 320]) }, { t: 0.15, r: r25([175.6, 64, 568.9, 320]) }, { t: 3.25, r: FULL, e: E.out }],
    camMod: (cam, t) => ({ ...cam, z: cam.z * (t < 2 * f ? 1.07 : 1) }),
    update(ctx) {
      const { t } = ctx;
      ctx.fx.tint = 0.1; ctx.fx.tintColor = '255,200,120'; ctx.fx.tintBlend = 'soft-light';
    },
    out: { type: 'cut' },
    sfx: [[0, 'cha_ching', { gain: 0.9 }], [0.02, 'drum_hit', { gain: 0.9 }], [0.25, 'confetti', { gain: 0.5, dur: 2.5 }], [0.3, 'cheer_woo', { gain: 0.0 }], [0.45, 'jump_whoosh', { gain: 0.4 }], [0.95, 'land_thump', { gain: 0.5 }], [0.45, 'chip_pop', { gain: 0.45, pan: -0.5 }]],
  },
  {
    id: '18', beats: 9,
    cam: [
      { t: 0, r: r25([2, 105, 480, 270]) }, { t: B, r: r25([2, 105, 480, 270]) },
      { t: 2 * B, r: r25([20, 105, 480, 270]) },
      { t: 2.55, r: r25([264.6, 97.8, 590.8, 332.3]), e: E.io },
      { t: 3.3, r: r25([264.6, 97.8, 590.8, 332.3]) }, { t: 3.9, r: r25([290.1, 232.9, 451.8, 254.1]) },
    ],
    update(ctx) {
      const { t } = ctx;
      press(ctx.c('Botón'), t, 0.25, 0.9); press(ctx.c('Resumen · Confirmar compra'), t, 0.8, 0.95);
      // onda de luz recorriendo el pipeline de izquierda a derecha
      const dot = pulseDot(ctx.s, 'wave', null, '#FFD23F', 14);
      const pts = [[1033, 666], [1289, 666], [1512, 666], [1770, 666]];
      const p = prog(t, 0.95, 2.45, E.linear) * (pts.length - 1); const i = Math.min(pts.length - 2, Math.floor(p)); const u = p - i;
      dot(lerp(pts[i][0], pts[i + 1][0], u), lerp(pts[i][1], pts[i + 1][1], u), t > 0.95 && t < 2.6 ? 1 : 0);
      // la notificación vuela a la derecha → evento Purchase de la toma 19
      const n = ctx.c('Notificación WhatsApp'); if (n) n.tx += 1500 * prog(t, 4.62, 5.0, E.in);
    },
    out: { type: 'whip', dir: 1, pre: 3 * f, post: 3 * f },
    sfx: [[0.25, 'tap_soft', { gain: 0.7, pan: -0.7 }], [0.8, 'tap_soft', { gain: 0.7, pan: 0.7, pitch: 1.1 }], [0.9, 'merge_whoosh', { gain: 0.55 }], ...[1.0, 1.4, 1.8, 2.2].map((tt, i) => [tt, 'ping', { gain: 0.5, pitch: [1, 1.12, 1.26, 1.5][i], pan: -0.3 + i * 0.25 }]), [3.8, 'wa_ding', { gain: 0.6, pan: 0.2 }], [4.6, 'fly_out', { gain: 0.5, pan: 0.6 }]],
  },
  {
    id: '19', beats: 9,
    cam: [
      { t: 0, r: r25([2, 88, 426.7, 240]) }, { t: 0.5, r: r25([2, 88, 426.7, 240]) },
      { t: 1.3, r: r25([104, 73, 480, 270]), e: E.sine },
      { t: 1.4, r: r25([104, 73, 480, 270]) }, { t: 2.3, r: r25([356, 73, 480, 270]), e: E.sine },
      { t: 2.7, r: r25([356, 73, 480, 270]) }, { t: 3.15, r: r25([404, 212, 384, 216]) },
    ],
    setup(ctx) {
      const s = ctx.s; const cost = ctx.el('Costo por compra');
      s.state.sk = strike(s, 'sk14', ctx.bbox('$14.00'), '#E5484D', cost.parentNode);
    },
    update(ctx) {
      const { t } = ctx;
      // paquete de datos: venta → Meta → Ads Manager
      const pk = pulseDot(ctx.s, 'pkt', null, '#8ab4ff', 13);
      let o = 0, x = 0, y = 0;
      if (t > 0.55 && t < 1.0) { const u = prog(t, 0.55, 1.0, E.io); [x, y] = qbez([500, 488], [640, 420], [760, 486], u); o = 1; }
      if (t > 1.45 && t < 2.05) { const u = prog(t, 1.45, 2.05, E.io); [x, y] = qbez([1030, 486], [1100, 380], [1180, 330], u); o = 1; }
      pk(x, y, o);
      const meta = ctx.c('Meta'); if (meta) { const z = keys(t, [[1.0, 1], [1.08, 1.1, E.out], [1.3, 1, E.io]]); meta.sx *= z; meta.sy *= z; }
      // contador: $14.00 se tacha y aparece $6.20
      ctx.s.state.sk(prog(t, 3.45, 3.7, E.out));
      const old = ctx.c('$14.00'); if (old) old.oMul = 1 - 0.55 * prog(t, 3.6, 3.9);
      const arr = ctx.c('→'), neu = ctx.c('$6.20');
      if (arr) hideUntil(arr, t, 3.7);
      if (neu) { neu.o = null; pop(neu, t, 3.78, 0.35, 0.4); }
      flashEl(ctx, 'glow620', [1140, 690, 700, 200], t, 3.8, 0.5, '#86efac', 0.35, 30);
      // el contador brilla y vuela a la izquierda (de vuelta al dueño)
      const card = ctx.c('Costo por compra'); if (card) { card.tx += -1600 * prog(t, 4.62, 5.0, E.in); }
    },
    out: { type: 'whip', dir: -1, pre: 3 * f, post: 3 * f },
    sfx: [[0.1, 'chip_pop', { gain: 0.45, pan: -0.6 }], [0.55, 'data_whoosh', { gain: 0.6, pan: -0.3 }], [1.0, 'meta_ping', { gain: 0.6 }], [1.45, 'data_whoosh', { gain: 0.5, pan: 0.3 }], [2.05, 'ping', { gain: 0.45, pan: 0.5, pitch: 1.2 }], [3.0, 'chip_pop', { gain: 0.4, pan: 0.5 }], [3.45, 'counter_down', { dur: 0.4, gain: 0.5, pan: 0.4 }], [3.78, 'coin_up', { gain: 0.6, pan: 0.4 }], [4.6, 'fly_out', { gain: 0.5, pan: -0.6 }]],
  },
  {
    id: '19b', beats: 4,
    cam: [{ t: 0, r: r25([88.6, 49.8, 590.8, 332.3]) }, { t: 2.22, r: r25([110, 62, 560, 315]) }],
    update(ctx) { ctx.fx.tint = 0.08; ctx.fx.tintColor = '255,210,140'; ctx.fx.tintBlend = 'soft-light'; },
    out: { type: 'cut' },
    sfx: [[0.1, 'mm_happy', { gain: 0.55 }], [0.3, 'soft_ding', { gain: 0.5 }], [0, 'morning_amb', { dur: 2.3, gain: 0.3 }]],
  },
  {
    id: '20', beats: 5,
    cam: [{ t: 0, r: FULL, rot: -2 }, { t: 1.2, r: FULL, rot: -2 }, { t: 2.3, r: r25([293, 210.1, 333.9, 187.8]), rot: -1 }],
    camMod: cam => ({ ...cam, z: cam.z * 1.04 }),
    update(ctx) {
      const { t } = ctx;
      // impresora térmica: la guía avanza a pasitos
      const g = ctx.c('Xpress / Guía real');
      if (g && g.figma) { const y = ctx.s.evalTrack(g.figma.tracks.TRANSLATION_Y, ctx.tau); const q = Math.round(y / 14) * 14; g.ty += (q - y) * 0.9 + (y > 1 ? Math.sin(t * 90) * 0.8 : 0); }
      if (t > 2.45) { const z = 1 - 0.1 * prog(t, 2.45, 2.75, E.in); g.sx *= z; g.sy *= z; g.r += -4 * prog(t, 2.45, 2.75, E.in); }
    },
    out: { type: 'flash', pre: 1 * f, post: 4 * f, color: '#ffffff', peak: 0.8 },
    sfx: [[0.1, 'printer', { dur: 0.95, gain: 0.6 }], [1.08, 'scanner_beep', { gain: 0.6 }], [0.43, 'chip_pop', { gain: 0.45, pan: 0.6 }], [0.9, 'chip_pop', { gain: 0.4, pan: 0.6 }], [2.45, 'slap_stick', { gain: 0.6 }]],
  },
  {
    id: '21', beats: 7,
    cam: [{ t: 0, r: r25([136, 252, 384, 216]) }, { t: 0.8, r: r25([136, 252, 384, 216]) }, { t: 2.4, r: FULL }],
    update(ctx) {
      const { t } = ctx;
      const w = ctx.c('Mensajero · contrapicado');
      if (w) { w.pivot = 'bc'; const sq = keys(t, [[1.2, 1], [1.45, 0.96, E.out], [1.75, 1.03, E.out], [2.1, 1, E.io]]); w.sy *= sq; w.sx *= 2 - sq; }
      blink(eyesOf(ctx, 'Mensajero · contrapicado'), t, [0.6, 2.9]);
      const chip = ctx.c('Chip · Sistrack · Recolectado ✓'); if (chip) { chip.sx = chip.sy = 1; pop(chip, t, 2.65); }
      // polvo en los pies al levantar
      const dust = ctx.s.state.dust || (ctx.s.state.dust = [0, 1, 2, 3].map(i => ctx.s.make('ellipse', { fill: '#e8dccb', opacity: 0 })));
      dust.forEach((d, i) => { const p = prog(t, 1.4 + i * 0.03, 2.1 + i * 0.05, E.out); const cx = 700 + (i - 1.5) * 90 + (i - 1.5) * 50 * p; d.setAttribute('cx', cx); d.setAttribute('cy', 1015 - 20 * p); d.setAttribute('rx', 30 + 50 * p); d.setAttribute('ry', 12 + 18 * p); d.setAttribute('opacity', t < 1.4 ? 0 : (0.5 * (1 - p)).toFixed(3)); });
    },
    out: { type: 'doorblack', pre: 5 * f, post: 5 * f },
    sfx: [[0, 'truck_arrive', { dur: 1.3, gain: 0.7, pan: 0.5 }], [1.0, 'air_brake', { gain: 0.5, pan: 0.6 }], [1.4, 'effort', { gain: 0.5 }], [2.45, 'box_load', { gain: 0.7, pan: 0.4 }], [2.5, 'suspension', { gain: 0.5, pan: 0.5 }], [2.65, 'chip_pop', { gain: 0.45, pan: 0.5 }], [3.62, 'metal_door', { gain: 0.8, pan: 0.3 }]],
  },
  {
    id: '22', beats: 7,
    cam: [{ t: 0, r: r25([2, 113.8, 590.8, 332.3]) }, { t: 3.45, r: r25([224.6, 113.8, 590.8, 332.3]), e: t => E.linear(t) }],
    camMod: (cam, t) => { // el travelling frena con overshoot al final
      const o = keys(t, [[3.25, 0], [3.55, 18, E.out], [3.8, -6, E.io], [3.89, 0]]); return { ...cam, cx: cam.cx + o };
    },
    setup(ctx) { ctx.s.state.chip2 = makeChip(ctx.s, 'Llega hoy', { x: 300, y: 330, fs: 26, h: 56, dot: '#22C55E' }); },
    update(ctx) {
      const { t } = ctx;
      const tr = ctx.c('Xpress / Camión real');
      if (tr) { tr.tx += keys(t, [[3.2, 0], [3.5, 40, E.out], [3.72, -8, E.io], [3.89, 0]]); tr.r += keys(t, [[3.35, 0], [3.5, 1.4, E.out], [3.7, -0.4], [3.85, 0]]); tr.pivot = 'bc'; }
      ctx.s.state.chip2.set(t, 2.0);
      // líneas de velocidad
      const L = ctx.s.state.lines || (ctx.s.state.lines = [0, 1, 2, 3, 4].map(i => ctx.s.make('line', { stroke: '#ffffff', 'stroke-width': 5, 'stroke-linecap': 'round', opacity: 0 })));
      L.forEach((l, i) => { const ph = (t * 1.6 + i * 0.37) % 1; const x = 1350 - ph * 900 + i * 40, y = 720 + i * 22; l.setAttribute('x1', x); l.setAttribute('x2', x + 160); l.setAttribute('y1', y); l.setAttribute('y2', y); l.setAttribute('opacity', (t < 3.3 ? 0.55 * Math.sin(Math.PI * ph) : 0).toFixed(3)); });
    },
    out: { type: 'cut' },
    sfx: [[0, 'engine', { dur: 3.9, gain: 0.7 }], [0, 'wind', { dur: 3.9, gain: 0.4 }], [0.4, 'status_whoosh', { gain: 0.5, pan: -0.4 }], [2.0, 'status_whoosh', { gain: 0.5, pan: -0.4, pitch: 1.12 }], [3.25, 'brake', { gain: 0.6 }]],
  },
  {
    id: '23', beats: 9,
    cam: [
      { t: 0, r: FULL }, { t: 1.3, r: FULL }, { t: 2.2, r: r25([64, 104, 512, 288]) },
      { t: 3.7, r: r25([64, 104, 512, 288]) }, { t: 3.7 + 1e-3, r: r25([465, 198.1, 333.9, 187.8]), e: E.linear }, { t: 5, r: r25([478, 205, 320, 180]) },
    ],
    update(ctx) {
      const { t } = ctx;
      const wil = ctx.c('Mensajero · entrega');
      if (wil) {
        if (t < 1.15) { wil.ty += -Math.abs(Math.sin(t * Math.PI * 3.4)) * 9; wil.r += Math.sin(t * Math.PI * 3.4) * 1.2; }
        wil.pivot = 'bc'; wil.r += keys(t, [[1.4, 0], [1.7, -1.2, E.io], [2.0, 0.8, E.io], [2.3, 0]]); // cambia el peso de pie mientras espera
        wil.ty += keys(t, [[2.4, 0], [2.6, -7, E.out], [2.9, 0, E.io]]);                            // sube al soltar la caja
      }
      blink(eyesOf(ctx, 'Mensajero · entrega'), t, [0.9, 2.1, 3.3]);
      const st = ctx.c('Estado Sistrack'); if (st) { st.sx = st.sy = 1; pop(st, t, 3.9); }
    },
    out: { type: 'cut' },
    sfx: [[0, 'street_amb', { dur: 5, gain: 0.35 }], ...[0.1, 0.38, 0.66, 0.94].map((tt, i) => [tt, 'step', { gain: 0.4, pan: -0.4 + i * 0.1 }]), [1.3, 'doorbell', { gain: 0.6, pan: 0.2 }], [2.0, 'door_open', { gain: 0.55, pan: 0.3 }], [2.35, 'box_handoff', { gain: 0.5 }], [2.9, 'gracias', { gain: 0.6, pan: 0.2 }], [3.2, 'jump_whoosh', { gain: 0.35, pan: 0.2 }], [3.9, 'beep_confirm', { gain: 0.6, pan: 0.4 }]],
  },
  {
    id: '24', beats: 9,
    cam: [
      { t: 0, r: r25([262.9, 114.9, 274.3, 154.3]) }, { t: 0.75, r: r25([262.9, 114.9, 274.3, 154.3]) },
      { t: 1.7, r: FULL }, { t: 3.05, r: FULL }, { t: 3.8, r: r25([400, 89, 480, 270]) },
    ],
    update(ctx) {
      const { t } = ctx;
      flashEl(ctx, 'row', [700, 330, 620, 70], t, 0.35, 0.4, '#22c55e', 0.35, 10);
      const L = pulseDot(ctx.s, 'pL', null, '#FFD23F', 13), Rr = pulseDot(ctx.s, 'pR', null, '#FFD23F', 13);
      const src = [960, 270];
      { const u = prog(t, 0.85, 1.22, E.io); const [x, y] = qbez(src, [520, 330], [370, 760], u); L(x, y, t > 0.85 && t < 1.25 ? 1 : 0); }
      { const u = prog(t, 1.4, 1.82, E.io); const [x, y] = qbez(src, [1380, 300], [1600, 560], u); Rr(x, y, t > 1.4 && t < 1.85 ? 1 : 0); }
      const u = ctx.c('Urbby AI · vigila'); if (u) { const z = keys(t, [[0.8, 1], [0.86, 1.12, E.out], [1.0, 1], [1.35, 1], [1.41, 1.12, E.out], [1.55, 1]]); u.sx *= z; u.sy *= z; }
      const fac = ctx.c('Resultado · Factura Facilito'); if (fac) { fac.sx = fac.sy = 1; pop(fac, t, 1.22); }
      const wa = ctx.c('Resultado · Conversación WhatsApp'); if (wa) { wa.sx = wa.sy = 1; pop(wa, t, 1.82); }
    },
    out: { type: 'dissolve', pre: 6 * f, post: 6 * f },
    sfx: [[0.35, 'state_click', { gain: 0.7 }], [0.8, 'visor_flash', { gain: 0.5 }], [0.85, 'pulse_zap', { gain: 0.5, pan: -0.5 }], [1.22, 'stamp', { gain: 0.6, pan: -0.5 }], [1.4, 'pulse_zap', { gain: 0.5, pan: 0.5 }], [1.82, 'wa_ding', { gain: 0.55, pan: 0.5 }], [2.6, 'msg_in', { gain: 0.4, pan: 0.5 }], [3.4, 'chime', { gain: 0.5 }]],
  },
  // ═════════════ ACTO 3 · LA VIDA NUEVA ═════════════
  {
    id: '25', beats: 7,
    cam: [{ t: 0, r: r25([26.7, 192, 426.7, 240]) }, { t: 0.4, r: r25([26.7, 192, 426.7, 240]) }, { t: 3.4, r: r25([225.7, 13.7, 548.6, 308.6]) }],
    update(ctx) {
      const { t } = ctx;
      const r = ctx.c('Dueño de espaldas'); if (r) { r.ty += keys(t, [[1.0, 0], [1.6, 9, E.io]]); r.r += keys(t, [[1.0, 0], [1.6, -1.2, E.io]]); r.pivot = 'bc'; }
      const pills = ['251_8882', '251_8886', '251_8890', '251_8894', '251_8898'].map(s => ctx.s.sid(s)).filter(Boolean);
      pills.forEach((el, i) => { const c = ctx.c(el); const t0 = 1.0 + i * 0.55; const z = keys(t, [[t0, 1], [t0 + 0.08, 1.12, E.out], [t0 + 0.3, 1, E.io]]); c.sx *= z; c.sy *= z; c.oMul = t > t0 && t < t0 + 0.3 ? 1 : 1; });
      pills.forEach((el, i) => { const b = el.getBBox(); flashEl(ctx, 'pf' + i, [b.x - 6, b.y - 4, b.width + 12, b.height + 8], t, 1.0 + i * 0.55, 0.35, '#ffffff', 0.7, b.height / 2); });
    },
    out: { type: 'cut' },
    sfx: [[0, 'morning_amb', { dur: 3.9, gain: 0.45 }], [1.1, 'sip', { gain: 0.5 }], ...[1.0, 1.55, 2.1, 2.65, 3.2].map((tt, i) => [tt, 'ping_soft', { gain: 0.35, pitch: 1 + i * 0.06, pan: 0.2 }])],
  },
  {
    id: '26', beats: 9,
    cam: [{ t: 0, r: r25([245.7, 33.7, 548.6, 308.6]) }, { t: 0.45, r: r25([245.7, 33.7, 548.6, 308.6]) }, { t: 2.5, r: FULL }],
    setup(ctx) {
      const s = ctx.s; const card = ctx.el('Antes → Con Urbby');
      s.state.sk = ['11 h', '3', '$1,350', '$14.00'].map((n, i) => strike(s, 'sk' + i, ctx.bbox(n), '#E5484D', card));
    },
    update(ctx) {
      const { t } = ctx;
      const beats = [1.4, 1.4 + B, 1.4 + 2 * B, 1.4 + 3 * B];
      ['11 h', '3', '$1,350', '$14.00'].forEach((n, i) => { const c = ctx.c(n); ctx.s.state.sk[i](prog(t, beats[i], beats[i] + 0.16, E.out)); if (c) c.oMul = 1 - 0.5 * prog(t, beats[i] + 0.1, beats[i] + 0.3); });
      ['1 h', '0', '$0', '$6.20'].forEach((n, i) => { const c = ctx.c(n); if (c) { pop(c, t, beats[i] + 0.12, 0.32, 0.3); } });
      ctx.fx.tint = 0.08; ctx.fx.tintColor = '255,210,140'; ctx.fx.tintBlend = 'soft-light';
    },
    out: { type: 'flash', pre: 2 * f, post: 4 * f, color: '#ffffff', peak: 0.7 },
    sfx: [[0, 'laugh_happy', { gain: 0.0 }], [0.1, 'celebrate_whoosh', { gain: 0.5 }], [0.65, 'card_in', { gain: 0.5, pan: -0.5 }], ...[1.4, 1.4 + B, 1.4 + 2 * B, 1.4 + 3 * B].map((tt, i) => [tt, 'tick_row', { gain: 0.6, pitch: 1 + i * 0.12, pan: -0.5 }]), [4.3, 'whoosh_up', { gain: 0.5 }]],
  },
  {
    id: '27', beats: 9,
    cam: [{ t: 0, r: r25([288, 134, 192, 108]) }, { t: 0.25, r: r25([288, 134, 192, 108]) }, { t: 2.6, r: r25([76.8, 43.2, 614.4, 345.6]) }, { t: 5, r: r25([80, 45, 604, 340]) }],
    update(ctx) {
      const { t } = ctx;
      // órbita: los íconos giran despacio alrededor de Urbby AI
      const C = [960, 585], rx = 640, ry = 250, w = 0.075;
      const names = ['Función · Inventario', 'Función · Urbby Pay', 'Función · Urbby CRM', 'Función · Facilito ERP', 'Función · Sistrack', 'Función · Meta Ads', 'Función · Envíos'];
      const times = [0.5, 0.9, 1.3, 1.7, 2.1, 2.5, 2.9];
      names.forEach((n, i) => {
        const c = ctx.c(n); if (!c) return;
        const p = ctx.s.constructor.center(c);
        const a0 = Math.atan2((p[1] - C[1]) / ry, (p[0] - C[0]) / rx); const rr = Math.hypot((p[0] - C[0]) / rx, (p[1] - C[1]) / ry);
        const a = a0 + w * t;
        c.tx += C[0] + rx * rr * Math.cos(a) - p[0]; c.ty += C[1] + ry * rr * Math.sin(a) - p[1];
      });
      // Urbby AI gira para "mirar" cada ícono cuando entra
      const m = ctx.el('Mascota'); const lin = m && ctx.c(ctx.s.find('Visor/Línea', m));
      const dirs = [1, -1, 1, -1, 1, -1, 1];
      if (lin) { let x = 0; times.forEach((ti, i) => { x = lerp(x, dirs[i] * 30, prog(t, ti - 0.1, ti + 0.15, E.out)); }); lin.tx += x; }
      const mc0 = ctx.c('Mascota'); if (mc0) { mc0.o = 1; mc0.sx = mc0.sy = 1; }
      const mc = ctx.c('Mascota'); if (mc) { let r = 0; times.forEach((ti, i) => { r = lerp(r, dirs[i] * 5, prog(t, ti - 0.1, ti + 0.2, E.out)); }); mc.r += r * prog(t, 0.4, 0.6); }
      ctx.cAll('Partícula').forEach((c, i) => { const a = t * 0.5 + i; c.tx += Math.cos(a) * 20; c.ty += Math.sin(a * 1.3) * 12; c.oMul = 0.5 + 0.5 * Math.abs(Math.sin(t * 2 + i)); });
    },
    out: { type: 'flash', pre: 2 * f, post: 6 * f, color: '#FFD23F', peak: 0.9 },
    sfx: [[0, 'visor_zoom', { gain: 0.5 }], ...[0.5, 0.9, 1.3, 1.7, 2.1, 2.5, 2.9].map((tt, i) => [tt, 'pop', { gain: 0.6, pitch: Math.pow(2, [0, 2, 4, 5, 7, 9, 11][i] / 12), pan: [-0.5, 0.5, -0.3, 0.6, -0.6, 0.3, 0.1][i] }]), [3.0, 'riser', { dur: 2.0, gain: 0.55 }]],
  },
  {
    id: '28', beats: 9, stillAfter: 2.3,
    cam: [{ t: 0, r: r25([64, 36, 640, 360]) }, { t: 2.2, r: FULL, e: E.out }],
    update(ctx) {
      const { t } = ctx;
      const u = ctx.c('Urbby AI');
      if (u) { u.r += keys(t, [[0.3, -540], [1.2, 0, E.outBack]]); u.tx += keys(t, [[0.3, 520], [1.1, 0, E.out]]); }
      const vis = u && ctx.c(ctx.s.find('Visor', u.el)); if (vis) { const w = keys(t, [[1.9, 1], [1.98, 0.12, E.in], [2.1, 0.12], [2.24, 1, E.out]]); vis.sy *= w; }   // guiño
      const logo = ctx.c('Logo'); if (logo) { logo.sx = logo.sy = 1; pop(logo, t, 0.75, 0.38); }
      const tag = ctx.c('Tagline'); if (tag) { tag.o = null; tag.ty = 0; hideUntil(tag, t, 0.75 + 4 * f); if (t >= 0.75 + 4 * f) { const p = prog(t, 0.75 + 4 * f, 1.25, E.out); tag.ty += (1 - p) * 20; tag.o = p; } }
      const btn = ctx.c('Chip · Conecta tu tienda'); if (btn) { btn.sx = btn.sy = 1; pop(btn, t, 1.65); }
      ctx.fx.black = prog(t, 4.55, 5.0, E.io);
    },
    out: null,
    sfx: [[0.0, 'final_hit', { gain: 0.9 }], [0.3, 'mascot_spin', { gain: 0.5, pan: 0.4 }], [0.75, 'brand_chime', { gain: 0.8 }], [1.65, 'chip_pop', { gain: 0.45 }], [1.98, 'wink', { gain: 0.5, pan: 0.3 }]],
  },
];

export const SHOTS_BY = new Map(SHOTS.map(s => [s.id, s]));
