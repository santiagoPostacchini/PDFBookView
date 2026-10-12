// Descarga las tipografías de los videos promocionales (Google Fonts, licencia
// SIL Open Font License) a public/fonts/ y escribe public/fonts/promo.css con
// @font-face locales. Sólo el subconjunto latino (alcanza para el español) y
// sólo los estilos que usan los textos del video.
//
//   node scripts/fetch-fonts.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'fonts');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** Familia, estilos pedidos a la API y carpeta de la licencia en github.com/google/fonts. */
const FAMILIES = [
  { family: 'Cormorant Garamond', query: 'Cormorant+Garamond:ital,wght@0,600;1,500', ofl: 'cormorantgaramond' },
  { family: 'Jost', query: 'Jost:wght@500', ofl: 'jost' },
  { family: 'Fraunces', query: 'Fraunces:ital,wght@0,600;1,500', ofl: 'fraunces' },
  { family: 'Manrope', query: 'Manrope:wght@500', ofl: 'manrope' },
  { family: 'Caveat', query: 'Caveat:wght@600', ofl: 'caveat' },
];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

async function get(url, as = 'text') {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return as === 'text' ? res.text() : Buffer.from(await res.arrayBuffer());
}

mkdirSync(OUT, { recursive: true });
const blocks = [];
const files = [];
for (const { family, query, ofl } of FAMILIES) {
  const css = await get(`https://fonts.googleapis.com/css2?family=${query}&display=block`);
  const downloaded = new Map();
  for (const [, subset, body] of css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g)) {
    if (subset !== 'latin') continue;
    const url = body.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
    const style = body.match(/font-style:\s*(\w+)/)?.[1] ?? 'normal';
    const weight = body.match(/font-weight:\s*([\d ]+)/)?.[1].trim() ?? '400';
    if (!url) continue;
    let file = downloaded.get(url);
    if (!file) {
      file = `${slug(family)}-${style}-${weight.replace(/ /g, '_')}.woff2`;
      const data = await get(url, 'buffer');
      writeFileSync(join(OUT, file), data);
      downloaded.set(url, file);
      files.push({ file, bytes: data.length, url });
    }
    blocks.push(body.replace(/src:[^;]+;/, `src: url('./${file}') format('woff2');`).trim());
  }
  const license = await get(`https://raw.githubusercontent.com/google/fonts/main/ofl/${ofl}/OFL.txt`);
  writeFileSync(join(OUT, `${slug(family)}-OFL.txt`), license);
  files.push({ file: `${slug(family)}-OFL.txt`, bytes: Buffer.byteLength(license), url: `github.com/google/fonts/ofl/${ofl}` });
}

const header = `/* Tipografías de los videos promocionales, autoalojadas (generado por scripts/fetch-fonts.mjs).
   Licencia: SIL Open Font License 1.1 (ver *-OFL.txt en esta carpeta). Subconjunto latino. */\n`;
writeFileSync(join(OUT, 'promo.css'), header + blocks.map((b) => `@font-face {\n  ${b.replace(/\n\s*/g, '\n  ')}\n}`).join('\n'));
for (const f of files) console.log(`${f.file.padEnd(42)} ${(f.bytes / 1024).toFixed(1).padStart(7)} KB  ← ${f.url}`);
console.log(`promo.css: ${blocks.length} @font-face`);
