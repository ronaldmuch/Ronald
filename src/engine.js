// Motor de animación: reproduce los keyframes de Figma (página "Producción") sobre los SVG
// exportados y agrega encima la dirección del "Plan de animación": cámaras A/B/C, transiciones,
// acting extra y efectos. Todo es una función pura del tiempo → render determinista cuadro a cuadro.

export const FPS = 24;
export const BPM = 108;
export const BEAT = 60 / BPM;
export const W = 1920, H = 1080;

// ───────────────────────── easing ─────────────────────────
export function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = t => ((ax * t + bx) * t + cx) * t;
  const sy = t => ((ay * t + by) * t + cy) * t;
  const dx = t => (3 * ax * t + 2 * bx) * t + cx;
  return x => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) { const e = sx(t) - x; const d = dx(t); if (Math.abs(e) < 1e-6) break; if (Math.abs(d) < 1e-6) break; t -= e / d; }
    if (t < 0 || t > 1 || Math.abs(sx(t) - x) > 1e-4) { let lo = 0, hi = 1; t = x; for (let i = 0; i < 30; i++) { const v = sx(t); if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; } }
    return sy(t);
  };
}
const c1 = 1.70158, c3 = c1 + 1;
export const E = {
  linear: t => t,
  io: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,      // in-out cúbico (default del plan)
  out: t => 1 - Math.pow(1 - t, 3),
  in: t => t * t * t,
  out5: t => 1 - Math.pow(1 - t, 5),
  in5: t => t ** 5,
  sine: t => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: t => 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2),    // golpes
  outBackBig: t => { const k = 2.6; return 1 + (k + 1) * Math.pow(t - 1, 3) + k * Math.pow(t - 1, 2); },
  outElastic: t => t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1,
};
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
// progreso normalizado de t en [a,b] con easing
export const prog = (t, a, b, ease = E.io) => ease(clamp((t - a) / (b - a)));
// interpolación por keys [[t, v, ease?], ...]
export function keys(t, ks, defEase = E.io) {
  if (t <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) {
    if (t <= ks[i][0]) { const [ta, va] = ks[i - 1]; const [tb, vb, e] = ks[i]; return lerp(va, vb, (e || defEase)((t - ta) / (tb - ta))); }
  }
  return ks[ks.length - 1][1];
}
// ruido suave determinista (drift de cámara, respiración irregular)
export function noise1(x, seed = 0) {
  const h = n => { const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453; return s - Math.floor(s); };
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(h(i), h(i + 1), u) * 2 - 1;
}
export function fbm(x, seed = 0) { return noise1(x, seed) * 0.6 + noise1(x * 2.13, seed + 7) * 0.3 + noise1(x * 4.7, seed + 13) * 0.1; }
export function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// ───────────────────────── matrices (formato SVG: a b c d e f) ─────────────────────────
export const I = [1, 0, 0, 1, 0, 0];
export function mul(m, n) { // m ∘ n (n primero)
  return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
}
export function inv(m) { const det = m[0] * m[3] - m[1] * m[2]; return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det]; }
export const T = (x, y) => [1, 0, 0, 1, x, y];
export const S = (sx, sy = sx) => [sx, 0, 0, sy, 0, 0];
export const R = deg => { const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return [c, s, -s, c, 0, 0]; }; // horario (+) en pantalla
export const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
export const chain = (...ms) => ms.reduce((a, b) => mul(a, b), I);
const fmt = m => `matrix(${m.map(v => +v.toFixed(5)).join(' ')})`;
const isI = m => Math.abs(m[0] - 1) < 1e-7 && Math.abs(m[1]) < 1e-7 && Math.abs(m[2]) < 1e-7 && Math.abs(m[3] - 1) < 1e-7 && Math.abs(m[4]) < 1e-5 && Math.abs(m[5]) < 1e-5;

// ───────────────────────── nombres de capas ─────────────────────────
// Los id del SVG vienen como "<nombre>@@<id figma>", con el nombre en UTF-8 leído como latin-1.
export function decodeName(raw) { try { return decodeURIComponent(escape(raw)); } catch (e) { return raw; } }

// ───────────────────────── Shot runtime ─────────────────────────
const SVGNS = 'http://www.w3.org/2000/svg';

export class Shot {
  constructor(def, svgText, kf, xf, container) {
    this.def = def; this.kf = kf; this.xf = xf;
    this.div = document.createElement('div');
    this.div.className = 'shot';
    this.div.style.display = 'none';
    this.div.innerHTML = svgText;
    container.appendChild(this.div);
    this.svg = this.div.querySelector('svg');
    this.svg.setAttribute('width', W); this.svg.setAttribute('height', H);
    this.root = this.svg.querySelector('g');
    this.bySid = new Map(); this.byName = new Map();
    for (const el of this.svg.querySelectorAll('[id*="@@"]')) {
      const [raw, sid] = el.id.split('@@');
      const name = decodeName(raw);
      el.dataset.name = name;
      this.bySid.set(sid, el);
      if (!this.byName.has(name)) this.byName.set(name, []);
      this.byName.get(name).push(el);
    }
    this.ctls = new Map();
    this.defs = this.svg.querySelector('defs') || this.svg.insertBefore(document.createElementNS(SVGNS, 'defs'), this.svg.firstChild);
    this.figmaDur = kf.timelines[0].duration;
    // Nodos con keyframes de Figma
    this.tracks = [];
    for (const n of kf.nodes) {
      if (!n.tracks || !Object.keys(n.tracks).length) continue;
      const sid = n.id.replace(/[^0-9A-Za-z]/g, '_');
      const el = this.bySid.get(sid);
      const x = xf[n.id];
      if (!el || !x) { console.warn('missing', def.id, n.name, n.id); continue; }
      const tr = {};
      for (const [k, v] of Object.entries(n.tracks)) tr[k] = v.kf.map(q => ({ t: q.t, v: q.v.value, e: q.e }));
      const c = this.ctl(el);
      c.figma = { tracks: tr, M0: [x[0][0], x[0][3], x[0][1], x[0][4], x[0][2], x[0][5]], P: x[1], w: x[2], h: x[3], name: n.name };
      this.tracks.push(c);
    }
    this.easeCache = new Map();
    this.cameraCtl = null; this.bgCtls = [];
    const cam = this.find(def.cameraLayer || 'Cámara · acción') || this.find('Plano (cámara)');
    if (cam) this.cameraCtl = this.ctl(cam);
    for (const nm of ['Fondo', 'Fondo / Escena split']) { const el = this.find(nm); if (el) this.bgCtls.push(this.ctl(el)); }
    this.state = {};
  }
  find(name, within) { const arr = this.byName.get(name) || []; return within ? arr.find(e => within.contains(e)) : arr[0]; }
  findAll(name, within) { const arr = this.byName.get(name) || []; return within ? arr.filter(e => within.contains(e)) : arr; }
  sid(s) { return this.bySid.get(s); }
  // Controlador de una capa: envuelve el elemento en un <g> cuya transform se recalcula cada cuadro
  ctl(el) {
    if (typeof el === 'string') el = this.find(el);
    if (!el) return null;
    if (this.ctls.has(el)) return this.ctls.get(el);
    const g = document.createElementNS(SVGNS, 'g');
    el.parentNode.insertBefore(g, el); g.appendChild(el);
    let bb; try { bb = el.getBBox(); } catch (e) { bb = { x: 0, y: 0, width: 0, height: 0 }; }
    const baseOp = el.getAttribute('opacity');
    const c = { el, g, bb, baseOp: baseOp == null ? 1 : +baseOp, figma: null };
    Shot.resetCtl(c);
    this.ctls.set(el, c);
    return c;
  }
  ease(e) {
    if (!e) return E.linear;
    const key = JSON.stringify(e);
    if (this.easeCache.has(key)) return this.easeCache.get(key);
    let f = E.linear;
    const b = e.easingFunctionCubicBezier;
    if (b) f = cubicBezier(b.x1, b.y1, b.x2, b.y2);
    else if (e.type === 'EASE_IN_AND_OUT') f = cubicBezier(0.42, 0, 0.58, 1);
    else if (e.type === 'EASE_OUT') f = cubicBezier(0, 0, 0.58, 1);
    else if (e.type === 'EASE_IN') f = cubicBezier(0.42, 0, 1, 1);
    this.easeCache.set(key, f);
    return f;
  }
  evalTrack(kf, t) {
    if (t <= kf[0].t) return kf[0].v;
    for (let i = 1; i < kf.length; i++) {
      if (t <= kf[i].t) { const a = kf[i - 1], b = kf[i]; const p = (t - a.t) / Math.max(1e-6, b.t - a.t); return a.v + (b.v - a.v) * this.ease(b.e)(p); }
    }
    return kf[kf.length - 1].v;
  }
  // ── por cuadro ──
  // centro de la capa: el de Figma si existe (exacto), si no el de su caja
  static center(c) {
    if (c.figma) { const f = c.figma; return apply(f.M0, f.w / 2, f.h / 2); }
    return [c.bb.x + c.bb.width / 2, c.bb.y + c.bb.height / 2];
  }
  static resetCtl(c) { c.tx = 0; c.ty = 0; c.r = 0; c.sx = 1; c.sy = 1; c.o = null; c.oMul = 1; c.pivot = null; c.pre = null; c.post = null; c.C = I; }
  reset() { for (const c of this.ctls.values()) Shot.resetCtl(c); }
  applyFigma(tau, skip) {
    for (const c of this.tracks) {
      if (skip && skip(c)) continue;
      const f = c.figma, tr = f.tracks;
      const v = (k, d) => tr[k] ? this.evalTrack(tr[k], tau) : d;
      const dx = v('TRANSLATION_X', 0), dy = v('TRANSLATION_Y', 0);
      const sx = v('SCALE_X', 1), sy = v('SCALE_Y', 1), dr = v('ROTATION', 0);
      if (tr.OPACITY) c.o = v('OPACITY', 1);
      const K = chain(T(f.w / 2, f.h / 2), R(-dr), S(sx, sy), T(-f.w / 2, -f.h / 2));
      const P = f.P; // [A,B,C,D] lineal del padre
      const d = [P[0] * dx + P[1] * dy, P[2] * dx + P[3] * dy];
      c.C = chain(T(d[0], d[1]), f.M0, K, inv(f.M0));
    }
  }
  commit() {
    for (const c of this.ctls.values()) {
      let m = c.C;
      if (c.tx || c.ty || c.r || c.sx !== 1 || c.sy !== 1) {
        let p = c.pivot;
        if (!p) p = Shot.center(c);
        else if (typeof p === 'string') {
          const b = c.bb;
          const px = { l: b.x, c: b.x + b.width / 2, r: b.x + b.width }, py = { t: b.y, c: b.y + b.height / 2, b: b.y + b.height };
          p = [px[p[1] || 'c'], py[p[0] || 'c']];   // 'bc' = abajo-centro, 'tl' = arriba-izquierda…
        }
        const pe = apply(c.C, p[0], p[1]);
        m = chain(T(pe[0] + c.tx, pe[1] + c.ty), R(c.r), S(c.sx, c.sy), T(-pe[0], -pe[1]), m);
      }
      if (c.pre) m = mul(c.pre, m);
      if (c.post) m = mul(m, c.post);
      if (isI(m)) c.g.removeAttribute('transform'); else c.g.setAttribute('transform', fmt(m));
      const o = (c.o == null ? c.baseOp : c.o) * c.oMul;
      if (c.o == null && c.oMul === 1) c.el.style.opacity = ''; else c.el.style.opacity = clamp(o).toFixed(4);
    }
  }
  // Elementos propios (overlays dentro del SVG, afectados por la cámara)
  make(tag, attrs = {}, parent) {
    const el = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    (parent || (this.cameraCtl ? this.cameraCtl.el : this.root)).appendChild(el);
    return el;
  }
  // Filtro de desenfoque por elemento (rack focus)
  blurFilter(key, parentEl) {
    const id = `${this.def.id}-blur-${key}`;
    let f = this.svg.getElementById ? this.svg.querySelector('#' + CSS.escape(id)) : null;
    if (!f) {
      f = document.createElementNS(SVGNS, 'filter');
      f.setAttribute('id', id); f.setAttribute('x', '-20%'); f.setAttribute('y', '-20%'); f.setAttribute('width', '140%'); f.setAttribute('height', '140%');
      const b = document.createElementNS(SVGNS, 'feGaussianBlur'); b.setAttribute('stdDeviation', '0'); f.appendChild(b);
      this.defs.appendChild(f);
    }
    return { id, set: v => { f.firstChild.setAttribute('stdDeviation', v.toFixed(2)); } };
  }
}

// Cámara: rect [x,y,w,h] (espacio 1920×1080) → transform que lo lleva a pantalla completa
export function camRect(r) {
  let [x, y, w, h] = r;
  const z = W / w; h = w * H / W;
  x = clamp(x, 0, W - w); y = clamp(y, 0, H - h);
  return { cx: x + w / 2, cy: y + h / 2, z };
}
export function camMatrix(cam) { // cam = {cx, cy, z, rot}
  return chain(T(W / 2, H / 2), R(cam.rot || 0), S(cam.z), T(-cam.cx, -cam.cy));
}
export function camAt(t, ks) { // ks: [{t, r:[x,y,w,h], e, rot}]
  const P = ks.map(k => ({ ...camRect(k.r), rot: k.rot || 0, t: k.t, e: k.e }));
  if (t <= P[0].t) return { ...P[0] };
  for (let i = 1; i < P.length; i++) {
    if (t <= P[i].t) {
      const a = P[i - 1], b = P[i]; const p = (b.e || E.io)((t - a.t) / Math.max(1e-6, b.t - a.t));
      // zoom interpolado en escala log y centro compensado para un movimiento "óptico"
      const z = Math.exp(lerp(Math.log(a.z), Math.log(b.z), p));
      const wz = (1 / z - 1 / a.z) / ((1 / b.z - 1 / a.z) || 1e-9);
      const q = Math.abs(b.z - a.z) < 1e-6 ? p : clamp(wz, 0, 1);
      return { cx: lerp(a.cx, b.cx, q), cy: lerp(a.cy, b.cy, q), z, rot: lerp(a.rot, b.rot, p) };
    }
  }
  return { ...P[P.length - 1] };
}
