// "Hornea" los filtros SVG costosos (blur, sombras, ruido) a PNG una sola vez, para que cada
// cuadro del video se rasterice rápido sin perder el look de Figma.
//   f  (desenfoque de capa)  → la capa completa se vuelve imagen
//   d  (sombras)             → imagen solo-sombra detrás del vector (el vector queda nítido)
//   n  (textura de ruido)    → capa de grano encima del personaje (el personaje queda vectorial)
//   i  (sombras internas)    → la capa completa se vuelve imagen en alta resolución
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(ROOT, 'assets/prod'), OUT = path.join(ROOT, 'assets/baked');
const only = process.argv.slice(2);
const shots = fs.readdirSync(SRC).filter(f => /^shot_.*\.svg$/.test(f)).map(f => f.slice(5, -4)).filter(id => !only.length || only.includes(id));
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const A = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const Bp = await browser.newPage();

for (const id of shots) {
  const t0 = Date.now();
  const dir = path.join(OUT, `shot_${id}`); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  await A.setContent(`<!doctype html><body style="margin:0">${fs.readFileSync(path.join(SRC, `shot_${id}.svg`), 'utf8')}</body>`);
  // halo de legibilidad para titulares (sombra suave horneada detrás del texto vectorial)
  await A.evaluate(() => {
    const NS = 'http://www.w3.org/2000/svg';
    const defs = document.querySelector('svg defs');
    const f = document.createElementNS(NS, 'filter');
    f.id = 'filter900_d_halo'; f.setAttribute('x', '-8%'); f.setAttribute('y', '-20%'); f.setAttribute('width', '116%'); f.setAttribute('height', '140%');
    f.setAttribute('color-interpolation-filters', 'sRGB');
    f.innerHTML = '<feMorphology in="SourceAlpha" operator="dilate" radius="3" result="d"/><feGaussianBlur in="d" stdDeviation="11" result="b"/><feOffset dy="3" result="o"/><feFlood flood-color="#06103a" flood-opacity="0.62"/><feComposite in2="o" operator="in" result="sh"/><feBlend mode="normal" in="SourceGraphic" in2="sh"/>';
    defs.appendChild(f);
  });
  const n = await A.evaluate(() => { const els = [...document.querySelectorAll('svg [filter]')]; els.forEach((e, i) => e.setAttribute('data-bake', i)); return els.length; });
  let done = 0;
  for (let i = 0; i < n; i++) {
    const spec = await A.evaluate(i => {
      const e = document.querySelector(`[data-bake="${i}"]`);
      if (!e) return null;
      const fid = /url\(#([^)]+)\)/.exec(e.getAttribute('filter'))[1];
      const f = document.getElementById(fid);
      const kind = (/filter\d+_([a-z]+)_/.exec(fid) || [])[1] || 'f';
      let x = +f.getAttribute('x'), y = +f.getAttribute('y'), w = +f.getAttribute('width'), h = +f.getAttribute('height');
      if (f.getAttribute('filterUnits') !== 'userSpaceOnUse' || !isFinite(x)) { const b = e.getBBox(); const mx = Math.max(40, b.width * 0.08), my = Math.max(40, b.height * 0.2); x = b.x - mx; y = b.y - my; w = b.width + 2 * mx; h = b.height + 2 * my; }
      // recorta a la zona útil (cuadro + margen por animaciones)
      const M = 700; const x0 = Math.max(x, -M), y0 = Math.max(y, -M), x1 = Math.min(x + w, 1920 + M), y1 = Math.min(y + h, 1080 + M);
      if (x1 <= x0 || y1 <= y0) return { skip: true };
      let mode = kind.includes('i') ? 'whole' : kind === 'n' ? 'grain' : kind === 'f' ? 'whole' : 'shadow';
      const blur = f.querySelector('feGaussianBlur');
      const sd = blur ? parseFloat(blur.getAttribute('stdDeviation')) : 0;
      let scale = mode === 'whole' && kind === 'f' ? (sd >= 30 ? 0.5 : 1) : mode === 'grain' ? 1.25 : kind.includes('i') ? 2 : 1;
      const maxDim = 4096; scale = Math.min(scale, maxDim / (x1 - x0), maxDim / (y1 - y0));
      // variante del filtro
      const f2 = f.cloneNode(true); f2.id = fid + '__bake';
      if (mode === 'shadow') f2.querySelectorAll('feBlend').forEach(b => { if (b.getAttribute('in') === 'SourceGraphic') b.remove(); });
      if (mode === 'grain') f2.querySelectorAll('feMergeNode').forEach(m => { if (m.getAttribute('in') === 'shape') m.remove(); });
      const clone = e.cloneNode(true);
      clone.setAttribute('filter', `url(#${f2.id})`);
      clone.removeAttribute('opacity'); clone.style.mixBlendMode = ''; clone.removeAttribute('data-bake');
      clone.querySelectorAll('[data-bake]').forEach(c => c.removeAttribute('data-bake'));
      const defs = document.querySelector('svg defs');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" fill="none" width="${(x1 - x0) * scale}" height="${(y1 - y0) * scale}" viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}"><defs>${defs.innerHTML}${f2.outerHTML}</defs>${clone.outerHTML}</svg>`;
      return { svg, x0, y0, w: x1 - x0, h: y1 - y0, scale, mode, kind, tag: e.tagName, hasT: e.hasAttribute('transform') };
    }, i);
    if (!spec || spec.skip) continue;
    const W = Math.ceil(spec.w * spec.scale), H = Math.ceil(spec.h * spec.scale);
    await Bp.setViewportSize({ width: W, height: H });
    await Bp.setContent(`<!doctype html><body style="margin:0;background:transparent">${spec.svg}</body>`);
    const file = `f${i}_${spec.kind}.png`;
    const ts = Date.now();
    await Bp.screenshot({ path: path.join(dir, file), omitBackground: true, clip: { x: 0, y: 0, width: W, height: H }, timeout: 300000 });
    if (Date.now() - ts > 5000) console.log(`  lento: ${file} ${W}x${H} ${((Date.now() - ts) / 1000).toFixed(1)} s`);
    await A.evaluate(({ i, spec, href }) => {
      const NS = 'http://www.w3.org/2000/svg';
      const e = document.querySelector(`[data-bake="${i}"]`);
      const G = document.createElementNS(NS, 'g');
      for (const a of ['id', 'opacity', 'style', 'transform']) if (e.hasAttribute(a)) { G.setAttribute(a, e.getAttribute(a)); e.removeAttribute(a); }
      e.removeAttribute('filter'); e.removeAttribute('data-bake');
      const img = document.createElementNS(NS, 'image');
      img.setAttribute('href', href); img.setAttribute('x', spec.x0); img.setAttribute('y', spec.y0); img.setAttribute('width', spec.w); img.setAttribute('height', spec.h);
      img.setAttribute('preserveAspectRatio', 'none');
      e.parentNode.insertBefore(G, e);
      if (spec.mode === 'whole') { G.appendChild(img); e.remove(); }
      else if (spec.mode === 'shadow') { G.appendChild(img); G.appendChild(e); }
      else if (spec.mode === 'grain') { G.appendChild(e); G.appendChild(img); }
    }, { i, spec, href: `../assets/baked/shot_${id}/${file}` });
    done++;
  }
  // pasada final: halos de titulares (imagen detrás del texto, dentro del mismo grupo → se anima con él)
  const halos = await A.evaluate(() => {
    const out = [];
    for (const e of document.querySelectorAll('svg [id]')) {
      let nm = e.id.split('@@')[0]; try { nm = decodeURIComponent(escape(nm)); } catch (err) {}
      if (!/^(Titular( 2)?|Tagline|Número)$/.test(nm)) continue;
      const b = e.getBBox(); const mx = 60, my = 50;
      const x0 = b.x - mx, y0 = b.y - my, w = b.width + 2 * mx, h = b.height + 2 * my;
      const clone = e.cloneNode(true); clone.removeAttribute('id'); clone.removeAttribute('opacity'); clone.removeAttribute('style');
      clone.querySelectorAll('image').forEach(im => im.remove());
      clone.setAttribute('filter', 'url(#filter900_d_halo_so)');
      const f = document.getElementById('filter900_d_halo').cloneNode(true); f.id = 'filter900_d_halo_so';
      f.querySelectorAll('feBlend').forEach(x => { if (x.getAttribute('in') === 'SourceGraphic') x.remove(); });
      f.setAttribute('filterUnits', 'userSpaceOnUse'); f.setAttribute('x', x0); f.setAttribute('y', y0); f.setAttribute('width', w); f.setAttribute('height', h);
      const defs = document.querySelector('svg defs');
      e.setAttribute('data-halo', out.length);
      out.push({ svg: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" width="${w}" height="${h}" viewBox="${x0} ${y0} ${w} ${h}"><defs>${defs.innerHTML}${f.outerHTML}</defs>${clone.outerHTML}</svg>`, x0, y0, w, h });
    }
    return out;
  });
  for (let k = 0; k < halos.length; k++) {
    const hs = halos[k]; const Wd = Math.ceil(hs.w), Hd = Math.ceil(hs.h);
    await Bp.setViewportSize({ width: Wd, height: Hd });
    await Bp.setContent(`<!doctype html><body style="margin:0;background:transparent">${hs.svg}</body>`);
    const file = `halo${k}.png`;
    await Bp.screenshot({ path: path.join(dir, file), omitBackground: true, clip: { x: 0, y: 0, width: Wd, height: Hd } });
    await A.evaluate(({ k, hs, href }) => {
      const NS = 'http://www.w3.org/2000/svg';
      let e = document.querySelector(`[data-halo="${k}"]`); e.removeAttribute('data-halo');
      if (e.tagName !== 'g') { const G = document.createElementNS(NS, 'g'); for (const a of ['id', 'opacity', 'style']) if (e.hasAttribute(a)) { G.setAttribute(a, e.getAttribute(a)); e.removeAttribute(a); } e.parentNode.insertBefore(G, e); G.appendChild(e); e = G; }
      const img = document.createElementNS(NS, 'image');
      img.setAttribute('href', href); img.setAttribute('x', hs.x0); img.setAttribute('y', hs.y0); img.setAttribute('width', hs.w); img.setAttribute('height', hs.h); img.setAttribute('preserveAspectRatio', 'none');
      e.insertBefore(img, e.firstChild);
    }, { k, hs, href: `../assets/baked/shot_${id}/${file}` });
  }
  const out = await A.evaluate(() => { document.querySelectorAll('[data-bake]').forEach(e => e.removeAttribute('data-bake')); return document.querySelector('svg').outerHTML; });
  fs.writeFileSync(path.join(OUT, `shot_${id}.svg`), out);
  console.log(`shot_${id}: ${done}/${n} filtros horneados en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
await browser.close();
