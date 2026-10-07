// Genera un álbum de ejemplo (PDF A5, 12 páginas) con ilustraciones de paisajes
// originales: sirve para probar el Estudio y mostrar plantillas sin usar álbumes
// de clientes (el repositorio es público).
//
//   node scripts/demo-album.mjs [--out out/demo/album-demo.pdf] [--png]
//
// Usa el Chrome headless que descarga Remotion (como studio-e2e.mjs).
import { mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const out = resolve(flag('out', 'out/demo/album-demo.pdf'));
mkdirSync(dirname(out), { recursive: true });

// ── Utilidades ──────────────────────────────────────────────────────────────

function random(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mix = (a, b, t) => `#${hex(a).map((x, i) => Math.round(x + (hex(b)[i] - x) * t).toString(16).padStart(2, '0')).join('')}`;
const f = (n) => n.toFixed(1);
let uid = 0;
const id = (p) => `${p}${++uid}`;

/** Perfil de cerros por desplazamiento de punto medio (n potencia de 2). */
function ridge(rand, n, rough) {
  const pts = new Array(n + 1).fill(0);
  pts[0] = rand() * 2 - 1;
  pts[n] = rand() * 2 - 1;
  for (let step = n, scale = 1; step > 1; step /= 2, scale *= rough) {
    const half = step / 2;
    for (let i = half; i < n; i += step) pts[i] = (pts[i - half] + pts[i + half]) / 2 + (rand() * 2 - 1) * scale;
  }
  const max = Math.max(...pts.map(Math.abs)) || 1;
  return pts.map((p) => p / max);
}

function ridgePath(rand, { w, base, amp, rough = 0.55, n = 128, bottom }) {
  const pts = ridge(rand, n, rough);
  let d = `M0 ${f(bottom)} `;
  pts.forEach((p, i) => (d += `L${f((i / n) * w)} ${f(base - p * amp)} `));
  return `${d}L${w} ${f(bottom)} Z`;
}

/** Colinas suaves: suma de senos. */
function hillPath(rand, { w, base, amp, waves = 2, bottom }) {
  const phase = [rand() * 6.28, rand() * 6.28, rand() * 6.28];
  const k = [waves, waves * 2.3, waves * 5.1];
  const a = [1, 0.35, 0.12];
  let d = `M0 ${f(bottom)} `;
  for (let i = 0; i <= 64; i++) {
    const x = i / 64;
    const y = a.reduce((s, ai, j) => s + ai * Math.sin(x * k[j] * Math.PI + phase[j]), 0) / 1.47;
    d += `L${f(x * w)} ${f(base - y * amp)} `;
  }
  return `${d}L${w} ${f(bottom)} Z`;
}

function gradient(stops, { x2 = 0, y2 = 1 } = {}) {
  const gid = id('g');
  const s = stops.map(([o, c, op = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${op}"/>`).join('');
  return { gid, def: `<linearGradient id="${gid}" x1="0" y1="0" x2="${x2}" y2="${y2}">${s}</linearGradient>` };
}

function radial(stops, cx = 0.5, cy = 0.5, r = 0.5) {
  const gid = id('r');
  const s = stops.map(([o, c, op = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${op}"/>`).join('');
  return { gid, def: `<radialGradient id="${gid}" cx="${cx}" cy="${cy}" r="${r}">${s}</radialGradient>` };
}

/**
 * Viñeta sobre toda la ilustración. (Sin grano: un filtro de ruido obliga a
 * Chrome a rasterizar cada foto y el PDF pasa de pocos MB a más de 50.)
 */
function finish(w, h, defs, body, _grain = 0, vignette = 0.28) {
  const v = radial([[0.55, '#000', 0], [1, '#000', vignette]], 0.5, 0.5, 0.75);
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
<defs>${defs.join('')}${v.def}</defs>${body}
<rect width="${w}" height="${h}" fill="url(#${v.gid})"/>
</svg>`;
}

/** Cordillera por capas con perspectiva atmosférica. */
function mountainLayers(rand, { w, h, sky, near, far, layers, top, bottom, rough = 0.55, amp }) {
  let body = '';
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1);
    const color = mix(far, near, t);
    const base = top + (bottom - top) * t;
    body += `<path d="${ridgePath(rand, { w, base, amp: amp * (1 - t * 0.45), rough, bottom: h })}" fill="${color}"/>`;
  }
  return body;
}

// ── Escenas ─────────────────────────────────────────────────────────────────

function sunsetMountains(seed, w = 1000, h = 1414) {
  const rand = random(seed);
  const sky = gradient([[0, '#22305e'], [0.38, '#7c3f73'], [0.62, '#e0786a'], [0.8, '#f8b77c']]);
  const sun = radial([[0, '#fff2cf'], [0.18, '#ffd99a'], [0.45, '#f7a76c', 0.55], [1, '#f7a76c', 0]], 0.5, 0.5, 0.5);
  const defs = [sky.def, sun.def];
  let body = `<rect width="${w}" height="${h}" fill="url(#${sky.gid})"/>`;
  body += `<circle cx="${w * 0.62}" cy="${h * 0.6}" r="${w * 0.42}" fill="url(#${sun.gid})"/>`;
  body += `<circle cx="${w * 0.62}" cy="${h * 0.6}" r="${w * 0.07}" fill="#fff3d6"/>`;
  body += mountainLayers(rand, { w, h, near: '#1f1a33', far: '#b7637a', layers: 5, top: h * 0.6, bottom: h * 0.86, amp: h * 0.12 });
  return finish(w, h, defs, body);
}

function lakeReflection(seed, w = 1000, h = 1000) {
  const rand = random(seed);
  const sky = gradient([[0, '#9fb8e8'], [0.55, '#f2c6d8'], [1, '#fde4cf']]);
  const water = gradient([[0, '#e7c9d8'], [1, '#5f6f9c']]);
  const defs = [sky.def, water.def];
  const horizon = h * 0.58;
  const mountains = mountainLayers(rand, { w, h: horizon, near: '#4a5684', far: '#b9a7cf', layers: 4, top: h * 0.33, bottom: h * 0.52, amp: h * 0.13, rough: 0.5 });
  const blur = id('b');
  defs.push(`<filter id="${blur}"><feGaussianBlur stdDeviation="3 1"/></filter>`);
  let body = `<rect width="${w}" height="${h}" fill="url(#${sky.gid})"/>`;
  body += `<circle cx="${w * 0.3}" cy="${h * 0.3}" r="${w * 0.05}" fill="#fff7ea" opacity="0.9"/>`;
  body += mountains;
  body += `<rect y="${horizon}" width="${w}" height="${h - horizon}" fill="url(#${water.gid})"/>`;
  body += `<g transform="translate(0 ${2 * horizon}) scale(1 -1)" opacity="0.55" filter="url(#${blur})">${mountains}</g>`;
  for (let i = 0; i < 28; i++) {
    const y = horizon + 6 + rand() * (h - horizon - 10);
    const x = rand() * w;
    body += `<rect x="${f(x)}" y="${f(y)}" width="${f(40 + rand() * 160)}" height="2" fill="#fff" opacity="${f(0.12 + rand() * 0.2)}"/>`;
  }
  return finish(w, h, defs, body);
}

function mistyForest(seed, w = 1000, h = 700) {
  const rand = random(seed);
  const sky = gradient([[0, '#d9e4dc'], [1, '#f2efe6']]);
  const defs = [sky.def];
  let body = `<rect width="${w}" height="${h}" fill="url(#${sky.gid})"/>`;
  for (let layer = 0; layer < 5; layer++) {
    const t = layer / 4;
    const color = mix('#b9cbbf', '#1f3b33', t);
    const base = h * (0.45 + t * 0.4);
    let trees = '';
    const count = 18 + layer * 6;
    for (let i = 0; i < count; i++) {
      const x = (i / count) * w + (rand() - 0.5) * 30;
      const th = (60 + rand() * 90) * (0.6 + t * 0.9);
      const tw = th * 0.32;
      trees += `<path d="M${f(x)} ${f(base - th)} L${f(x + tw / 2)} ${f(base)} L${f(x - tw / 2)} ${f(base)} Z"/>`;
    }
    body += `<g fill="${color}">${trees}<rect y="${f(base - 1)}" width="${w}" height="${f(h - base + 1)}"/></g>`;
    body += `<rect y="${f(base - 40)}" width="${w}" height="80" fill="#eef2ea" opacity="${f(0.18 * (1 - t))}"/>`;
  }
  return finish(w, h, defs, body, 0.12, 0.22);
}

function road(seed, w = 1000, h = 700) {
  const rand = random(seed);
  const sky = gradient([[0, '#7fb2d9'], [0.7, '#cfe3ee'], [1, '#f3e6cf']]);
  const ground = gradient([[0, '#c9a46c'], [1, '#8a6a3f']]);
  const defs = [sky.def, ground.def];
  const horizon = h * 0.5;
  let body = `<rect width="${w}" height="${h}" fill="url(#${sky.gid})"/>`;
  for (let i = 0; i < 5; i++) body += `<ellipse cx="${f(rand() * w)}" cy="${f(h * (0.12 + rand() * 0.2))}" rx="${f(60 + rand() * 90)}" ry="${f(12 + rand() * 10)}" fill="#fff" opacity="0.7"/>`;
  body += `<path d="${hillPath(rand, { w, base: horizon, amp: h * 0.035, waves: 1.5, bottom: h })}" fill="#a98b72"/>`;
  body += `<rect y="${f(horizon + h * 0.02)}" width="${w}" height="${h}" fill="url(#${ground.gid})"/>`;
  const vx = w * 0.52;
  body += `<path d="M${f(vx - 6)} ${f(horizon + h * 0.02)} L${f(vx + 6)} ${f(horizon + h * 0.02)} L${f(w * 0.86)} ${h} L${f(w * 0.12)} ${h} Z" fill="#4d4a4c"/>`;
  for (let i = 0; i < 9; i++) {
    const t0 = (i + 0.2) / 9;
    const t1 = t0 + 0.5 / 9;
    const y0 = horizon + h * 0.02 + (h - horizon) * t0 * t0;
    const y1 = horizon + h * 0.02 + (h - horizon) * t1 * t1;
    const x0 = vx + (w * 0.49 - vx) * t0 * t0;
    const x1 = vx + (w * 0.49 - vx) * t1 * t1;
    body += `<path d="M${f(x0 - 1 - 4 * t0)} ${f(y0)} L${f(x0 + 1 + 4 * t0)} ${f(y0)} L${f(x1 + 1 + 4 * t1)} ${f(y1)} L${f(x1 - 1 - 4 * t1)} ${f(y1)} Z" fill="#f1e3a8"/>`;
  }
  return finish(w, h, defs, body);
}

function starryNight(seed, w = 1000, h = 1414) {
  const rand = random(seed);
  const sky = gradient([[0, '#070b1e'], [0.6, '#1a2552'], [1, '#3b3f6e']]);
  const glow = radial([[0, '#ffd59a', 0.95], [1, '#ffb45e', 0]]);
  const milky = id('m');
  const defs = [sky.def, glow.def, `<filter id="${milky}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="40"/></filter>`];
  let body = `<rect width="${w}" height="${h}" fill="url(#${sky.gid})"/>`;
  body += `<g filter="url(#${milky})" transform="rotate(-28 ${w / 2} ${h * 0.35})"><ellipse cx="${w / 2}" cy="${h * 0.35}" rx="${w * 0.9}" ry="${h * 0.06}" fill="#9fb0ff" opacity="0.35"/><ellipse cx="${w / 2}" cy="${h * 0.35}" rx="${w * 0.6}" ry="${h * 0.025}" fill="#ffe9d6" opacity="0.35"/></g>`;
  for (let i = 0; i < 420; i++) {
    const r = rand() < 0.94 ? 0.6 + rand() * 1.4 : 2 + rand() * 1.8;
    body += `<circle cx="${f(rand() * w)}" cy="${f(rand() * h * 0.75)}" r="${f(r)}" fill="#fff" opacity="${f(0.35 + rand() * 0.65)}"/>`;
  }
  body += mountainLayers(rand, { w, h, near: '#05060d', far: '#2a2f55', layers: 3, top: h * 0.7, bottom: h * 0.84, amp: h * 0.08 });
  const tx = w * 0.64;
  const ty = h * 0.905;
  body += `<circle cx="${tx}" cy="${ty - 20}" r="120" fill="url(#${glow.gid})"/>`;
  body += `<path d="M${tx - 46} ${ty} L${tx} ${ty - 70} L${tx + 46} ${ty} Z" fill="#f7b866"/><path d="M${tx - 8} ${ty} L${tx} ${ty - 30} L${tx + 8} ${ty} Z" fill="#7a3d12"/>`;
  return finish(w, h, defs, body, 0.08, 0.35);
}

function seaCliffs(seed, w = 1000, h = 760) {
  const rand = random(seed);
  const sky = gradient([[0, '#f6d6b8'], [0.6, '#f3b39a'], [1, '#e7a3a1']]);
  const sea = gradient([[0, '#7e9fc0'], [1, '#2e4f78']]);
  const defs = [sky.def, sea.def];
  const horizon = h * 0.55;
  let body = `<rect width="${w}" height="${h}" fill="url(#${sky.gid})"/>`;
  body += `<circle cx="${w * 0.3}" cy="${horizon - 20}" r="${w * 0.06}" fill="#fff1dc"/>`;
  body += `<rect y="${horizon}" width="${w}" height="${h - horizon}" fill="url(#${sea.gid})"/>`;
  for (let i = 0; i < 40; i++) body += `<rect x="${f(rand() * w)}" y="${f(horizon + 4 + rand() * (h - horizon))}" width="${f(20 + rand() * 80)}" height="2" fill="#ffe8d0" opacity="${f(0.15 + rand() * 0.25)}"/>`;
  body += `<path d="M${w} ${h} L${w} ${h * 0.25} L${w * 0.86} ${h * 0.3} L${w * 0.78} ${h * 0.42} L${w * 0.72} ${h * 0.47} L${w * 0.66} ${h * 0.7} L${w * 0.6} ${h} Z" fill="#3a2f3a"/>`;
  body += `<path d="M${w * 0.62} ${h} L${w * 0.67} ${h * 0.72} L${w * 0.74} ${h * 0.5} L${w * 0.8} ${h * 0.47} L${w * 0.86} ${h * 0.5} L${w} ${h * 0.42} L${w} ${h} Z" fill="#241c27"/>`;
  body += `<path d="M${w * 0.08} ${h * 0.62} l50 0 l-8 -32 l-30 6 z" fill="#2d2a3a" opacity="0.8"/>`;
  return finish(w, h, defs, body);
}

function boat(seed, w = 800, h = 800) {
  const rand = random(seed);
  const sky = gradient([[0, '#cfe6f2'], [1, '#f6efe1']]);
  const water = gradient([[0, '#9cc3d6'], [1, '#4f87a6']]);
  const defs = [sky.def, water.def];
  const horizon = h * 0.6;
  let body = `<rect width="${w}" height="${h}" fill="url(#${sky.gid})"/>`;
  body += `<path d="${hillPath(rand, { w, base: horizon, amp: h * 0.06, waves: 1.2, bottom: h })}" fill="#8fa9a3"/>`;
  body += `<rect y="${horizon}" width="${w}" height="${h - horizon}" fill="url(#${water.gid})"/>`;
  const bx = w * 0.45;
  const by = h * 0.74;
  body += `<path d="M${bx - 70} ${by} L${bx + 80} ${by} L${bx + 55} ${by + 22} L${bx - 50} ${by + 22} Z" fill="#7a3b2e"/>`;
  body += `<path d="M${bx} ${by - 4} L${bx} ${by - 150} L${bx + 70} ${by - 10} Z" fill="#fbf6ee"/><path d="M${bx - 6} ${by - 4} L${bx - 6} ${by - 120} L${bx - 60} ${by - 10} Z" fill="#e9dcc8"/>`;
  body += `<g transform="translate(0 ${2 * by + 44}) scale(1 -1)" opacity="0.25"><path d="M${bx} ${by - 4} L${bx} ${by - 150} L${bx + 70} ${by - 10} Z" fill="#fbf6ee"/></g>`;
  return finish(w, h, defs, body);
}

function meadow(seed, w = 800, h = 800) {
  const rand = random(seed);
  const sky = gradient([[0, '#a8d0e6'], [1, '#eef4e6']]);
  const defs = [sky.def];
  let body = `<rect width="${w}" height="${h}" fill="url(#${sky.gid})"/>`;
  body += `<path d="${hillPath(rand, { w, base: h * 0.52, amp: h * 0.05, waves: 1, bottom: h })}" fill="#9cbf8a"/>`;
  body += `<path d="${hillPath(rand, { w, base: h * 0.64, amp: h * 0.05, waves: 1.6, bottom: h })}" fill="#7aa86b"/>`;
  body += `<path d="${hillPath(rand, { w, base: h * 0.78, amp: h * 0.04, waves: 2, bottom: h })}" fill="#5b8f55"/>`;
  const colors = ['#f6d36b', '#f29ab1', '#ffffff', '#c9a5f0'];
  for (let i = 0; i < 260; i++) {
    const y = h * (0.66 + rand() * 0.34);
    const r = 1.5 + ((y - h * 0.66) / (h * 0.34)) * 5 * rand();
    body += `<circle cx="${f(rand() * w)}" cy="${f(y)}" r="${f(r)}" fill="${colors[i % 4]}" opacity="0.9"/>`;
  }
  return finish(w, h, defs, body);
}

function steppe(seed, w = 1000, h = 1414) {
  const rand = random(seed);
  const sky = gradient([[0, '#5d7fb5'], [0.5, '#e9b48a'], [0.75, '#f6d3a1']]);
  const sun = radial([[0, '#fff3d0'], [0.2, '#ffe0a6', 0.9], [1, '#ffcf8a', 0]]);
  const defs = [sky.def, sun.def];
  let body = `<rect width="${w}" height="${h}" fill="url(#${sky.gid})"/>`;
  body += `<circle cx="${w * 0.36}" cy="${h * 0.6}" r="${w * 0.35}" fill="url(#${sun.gid})"/>`;
  const colors = ['#c9935f', '#b07a49', '#94613a', '#6f4528', '#4b2d1b'];
  colors.forEach((c, i) => {
    body += `<path d="${hillPath(rand, { w, base: h * (0.62 + i * 0.075), amp: h * 0.03, waves: 0.8 + i * 0.4, bottom: h })}" fill="${c}"/>`;
  });
  for (let i = 0; i < 90; i++) {
    const x = rand() * w;
    const y = h * (0.86 + rand() * 0.14);
    body += `<path d="M${f(x)} ${f(y)} q -6 -26 -2 -40 M${f(x)} ${f(y)} q 4 -24 10 -34" stroke="#d9a76a" stroke-width="2" fill="none" opacity="0.6"/>`;
  }
  return finish(w, h, defs, body);
}

function glacier(seed, w = 1000, h = 1414) {
  const rand = random(seed);
  const sky = gradient([[0, '#7fa7d6'], [1, '#e3eef7']]);
  const water = gradient([[0, '#6f9fc4'], [1, '#2b5d86']]);
  const defs = [sky.def, water.def];
  let body = `<rect width="${w}" height="${h}" fill="url(#${sky.gid})"/>`;
  body += mountainLayers(rand, { w, h, near: '#7c8fa6', far: '#c9d6e6', layers: 3, top: h * 0.4, bottom: h * 0.5, amp: h * 0.12, rough: 0.6 });
  body += `<path d="${ridgePath(rand, { w, base: h * 0.6, amp: h * 0.035, rough: 0.7, bottom: h * 0.68 })}" fill="#eaf4fb"/>`;
  body += `<rect y="${h * 0.6}" width="${w}" height="${h * 0.08}" fill="#cfe5f3"/>`;
  for (let i = 0; i < 14; i++) body += `<rect x="${f(rand() * w)}" y="${f(h * (0.61 + rand() * 0.06))}" width="3" height="${f(20 + rand() * 40)}" fill="#9cc6e0" opacity="0.7"/>`;
  body += `<rect y="${h * 0.68}" width="${w}" height="${h * 0.32}" fill="url(#${water.gid})"/>`;
  for (let i = 0; i < 6; i++) {
    const x = rand() * w;
    const y = h * (0.72 + rand() * 0.24);
    const s = 20 + rand() * 50;
    body += `<path d="M${f(x)} ${f(y)} l${f(s)} ${f(-s * 0.5)} l${f(s * 0.8)} ${f(s * 0.45)} l${f(-s * 0.2)} ${f(s * 0.1)} Z" fill="#f3fbff"/>`;
  }
  return finish(w, h, defs, body);
}

function mapIllustration(seed, w = 900, h = 700) {
  const rand = random(seed);
  let body = `<rect width="${w}" height="${h}" fill="#efe6d4"/>`;
  body += `<path d="M${w * 0.25} 0 C ${w * 0.32} ${h * 0.2}, ${w * 0.18} ${h * 0.4}, ${w * 0.3} ${h * 0.6} S ${w * 0.4} ${h * 0.9}, ${w * 0.36} ${h} L0 ${h} L0 0 Z" fill="#b9d3d8"/>`;
  for (let i = 0; i < 6; i++) body += `<path d="M${f(w * (0.5 + rand() * 0.4))} ${f(h * (0.15 + rand() * 0.7))} l14 -24 l14 24 z" fill="#b59b7c"/>`;
  const pts = [[0.38, 0.12], [0.55, 0.3], [0.48, 0.52], [0.66, 0.68], [0.58, 0.88]].map(([x, y]) => [x * w, y * h]);
  body += `<path d="M${pts.map((p) => p.map(f).join(' ')).join(' L')}" stroke="#c2562f" stroke-width="5" stroke-dasharray="4 12" stroke-linecap="round" fill="none"/>`;
  for (const [x, y] of pts) body += `<circle cx="${f(x)}" cy="${f(y)}" r="11" fill="#c2562f"/><circle cx="${f(x)}" cy="${f(y)}" r="4" fill="#fff"/>`;
  return finish(w, h, [], body, 0.06, 0.12);
}

// ── Páginas ─────────────────────────────────────────────────────────────────

const photo = (svg, style, cls = '') => `<div class="photo ${cls}" style="${style}">${svg}</div>`;
const polaroid = (svg, style, caption) =>
  `<figure class="polaroid" style="${style}"><div class="pic">${svg}</div><figcaption>${caption}</figcaption></figure>`;

const pages = [
  // 1 · Tapa
  `<section class="page bleed">${sunsetMountains(11)}
    <div class="cover-title"><span class="kicker">Patagonia · 2026</span><h1>Nuestro<br>viaje</h1><span class="rule"></span></div></section>`,
  // 2 · Interior de tapa
  `<section class="page paper center"><p class="dedication">Para nosotros,<br>que siempre volvemos.</p>
    <svg class="mini-mtn" viewBox="0 0 60 30"><path d="M2 28 L20 8 L30 18 L40 4 L58 28" fill="none" stroke="#b08a5a" stroke-width="1.6"/></svg></section>`,
  // 3
  `<section class="page paper"><h2 class="day">Día uno</h2>
    ${photo(lakeReflection(21), 'left:12mm;top:34mm;width:124mm;height:124mm')}
    <p class="hand" style="left:14mm;top:166mm">El primer amanecer, todavía con frío.</p></section>`,
  // 4
  `<section class="page paper">${photo(mistyForest(31), 'left:14mm;top:14mm;width:110mm;height:77mm;transform:rotate(-1.6deg)')}
    <p class="hand" style="left:72mm;top:95mm">Bosque de lengas</p>
    ${photo(road(41), 'left:24mm;top:112mm;width:110mm;height:77mm;transform:rotate(1.4deg)')}
    <p class="hand" style="left:18mm;top:193mm">Ruta 40, sin apuro</p></section>`,
  // 5
  `<section class="page bleed">${starryNight(51)}<p class="hand light" style="left:12mm;bottom:12mm">Noche en el refugio</p></section>`,
  // 6
  `<section class="page paper">${photo(seaCliffs(61), 'left:12mm;top:14mm;width:124mm;height:94mm')}
    ${photo(boat(71), 'left:12mm;top:116mm;width:60mm;height:60mm')}
    ${photo(meadow(81), 'left:76mm;top:116mm;width:60mm;height:60mm')}
    <p class="hand" style="left:14mm;top:182mm">El mar, el lago y las flores del camino.</p></section>`,
  // 7
  `<section class="page paper center"><blockquote>“Lo mejor del viaje<br>fue el camino.”</blockquote>
    ${photo(lakeReflection(91), 'position:relative;width:84mm;height:84mm;margin-top:14mm')}</section>`,
  // 8
  `<section class="page bleed">${steppe(101)}<p class="hand light" style="right:12mm;top:14mm">La estepa al atardecer</p></section>`,
  // 9
  `<section class="page paper">
    ${polaroid(glacier(111, 800, 800), 'left:12mm;top:16mm;transform:rotate(-2deg)', 'Hielo azul')}
    ${polaroid(boat(121), 'left:78mm;top:20mm;transform:rotate(2.5deg)', 'Lago quieto')}
    ${polaroid(mistyForest(131, 800, 800), 'left:14mm;top:110mm;transform:rotate(1.5deg)', 'Niebla')}
    ${polaroid(sunsetMountains(141, 800, 800), 'left:80mm;top:108mm;transform:rotate(-1.8deg)', 'Último sol')}</section>`,
  // 10
  `<section class="page bleed">${glacier(151)}<p class="hand light" style="left:12mm;bottom:14mm">Frente al glaciar</p></section>`,
  // 11
  `<section class="page paper center"><h2 class="closing">Hasta el<br>próximo viaje</h2>
    ${photo(mapIllustration(161), 'position:relative;width:110mm;height:86mm;margin-top:10mm')}</section>`,
  // 12 · Contratapa
  `<section class="page back center"><p class="brand">Álbum personalizado</p><p class="made">Hecho a mano, página por página</p></section>`,
];

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@500;600&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Jost:wght@300;400;500&display=block" rel="stylesheet">
<style>
@page { size: 148mm 210mm; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
.page { width: 148mm; height: 210mm; position: relative; overflow: hidden; break-after: page; }
.paper { background: #fbf7ef; }
.back { background: linear-gradient(#2b3561, #6b3b67); color: #fbefe6; }
.center { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.bleed > svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.photo { position: absolute; overflow: hidden; background: #fff; box-shadow: 0 0.5mm 1.4mm rgba(70, 45, 25, 0.28); }
.photo > svg { display: block; width: 100%; height: 100%; }
.polaroid { position: absolute; margin: 0; width: 58mm; padding: 3mm 3mm 0; background: #fff; box-shadow: 0 0.6mm 1.6mm rgba(70, 45, 25, 0.3); }
.polaroid .pic { width: 52mm; height: 52mm; overflow: hidden; }
.polaroid .pic svg { display: block; width: 100%; height: 100%; }
.polaroid figcaption { font: 600 15pt/11mm 'Caveat', cursive; color: #4a3a2c; text-align: center; }
.cover-title { position: absolute; left: 0; right: 0; top: 30mm; text-align: center; color: #fff8ee; text-shadow: 0 0.4mm 2mm rgba(30, 10, 40, 0.35); }
.cover-title h1 { margin: 5mm 0 0; font: 600 54pt/0.92 'Cormorant Garamond', serif; letter-spacing: 0.01em; }
.kicker { font: 400 9pt 'Jost', sans-serif; letter-spacing: 0.42em; text-transform: uppercase; }
.rule { display: inline-block; width: 18mm; height: 0.4mm; margin-top: 6mm; background: #fff1de; }
.dedication { margin: 0; font: 600 22pt/1.25 'Caveat', cursive; color: #5a4632; }
.mini-mtn { width: 20mm; margin-top: 8mm; }
.day { position: absolute; left: 0; right: 0; top: 12mm; margin: 0; text-align: center; font: italic 500 24pt 'Cormorant Garamond', serif; color: #6b4e33; }
.hand { position: absolute; margin: 0; font: 600 15pt 'Caveat', cursive; color: #5a4632; }
.hand.light { color: #fff6e8; text-shadow: 0 0.3mm 1.2mm rgba(0, 0, 0, 0.45); }
blockquote { margin: 0; font: italic 500 24pt/1.2 'Cormorant Garamond', serif; color: #5b4330; }
.closing { margin: 0; font: 500 28pt/1.05 'Cormorant Garamond', serif; color: #5b4330; }
.brand { margin: 0; font: 600 20pt 'Cormorant Garamond', serif; letter-spacing: 0.02em; }
.made { margin: 3mm 0 0; font: 300 8pt 'Jost', sans-serif; letter-spacing: 0.3em; text-transform: uppercase; opacity: 0.85; }
</style></head><body>${pages.join('\n')}</body></html>`;

const exe = findExe('node_modules/.remotion/chrome-headless-shell');
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 560, height: 794 }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: out, width: '148mm', height: '210mm', printBackground: true, preferCSSPageSize: true });
console.log('PDF:', out);
if (args.includes('--png')) {
  const sections = await page.$$('section.page');
  for (let i = 0; i < sections.length; i++) {
    const file = join(dirname(out), `pagina-${String(i + 1).padStart(2, '0')}.png`);
    await sections[i].screenshot({ path: file });
  }
  console.log(`PNG de ${sections.length} páginas en ${dirname(out)}`);
}
await browser.close();

function findExe(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && /^chrome-headless-shell(\.exe)?$/.test(entry.name)) return join(entry.parentPath ?? entry.path, entry.name);
  }
  throw new Error('No se encontró chrome-headless-shell (corré un render de Remotion una vez para descargarlo).');
}
