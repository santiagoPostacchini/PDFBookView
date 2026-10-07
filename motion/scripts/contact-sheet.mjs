// Hoja de contacto: imágenes en fila con un rótulo cada una (para comparar cuadros).
//
//   node scripts/contact-sheet.mjs <salida.png> "<rótulo>=<imagen>" ... [--title "Título"] [--width 1800]
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : fallback;
};
const title = flag('title', '');
const width = Number(flag('width', '1800'));
const [out, ...items] = args;
const cells = items
  .map((item) => {
    const [label, file] = item.includes('=') ? item.split(/=(.*)/s) : ['', item];
    const type = extname(file).toLowerCase() === '.png' ? 'png' : 'jpeg';
    const b64 = readFileSync(resolve(file)).toString('base64');
    return `<figure><img src="data:image/${type};base64,${b64}"><figcaption>${label}</figcaption></figure>`;
  })
  .join('');

const browser = await chromium.launch({ executablePath: findExe('node_modules/.remotion/chrome-headless-shell') });
const page = await browser.newPage({ viewport: { width, height: 900 } });
await page.setContent(`<!doctype html><meta charset="utf-8"><style>
  body { margin: 0; padding: 28px; background: #1d1b19; font: 16px 'Segoe UI', sans-serif; color: #eee; }
  h1 { font-weight: 600; font-size: 20px; margin: 0 0 18px; }
  .row { display: flex; gap: 16px; } figure { margin: 0; flex: 1; min-width: 0; }
  img { width: 100%; display: block; border-radius: 6px; } figcaption { margin-top: 8px; color: #cfc8bf; }
</style>${title ? `<h1>${title}</h1>` : ''}<div class="row">${cells}</div>`);
await page.waitForTimeout(200);
await page.setViewportSize({ width, height: await page.evaluate(() => document.body.scrollHeight) });
await page.screenshot({ path: resolve(out) });
await browser.close();
console.log('hoja:', resolve(out));

function findExe(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && /^chrome-headless-shell(\.exe)?$/.test(entry.name)) return join(entry.parentPath ?? entry.path, entry.name);
  }
  throw new Error('No se encontró chrome-headless-shell.');
}
