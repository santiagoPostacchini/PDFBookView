// Rasteriza las páginas de un PDF a PNG con el pdf.js del proyecto (no hay poppler en esta máquina).
// Con npm run dev en la raíz:
//   node scripts/pdf-pages.mjs <archivo.pdf> <carpeta-salida> [--pages 1-4] [--width 900]
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : fallback;
};
const range = flag('pages', '');
const width = Number(flag('width', '900'));
const url = flag('url', 'http://localhost:5173/');
const [file, outArg] = args;
assert.ok(file && outArg, 'Uso: pdf-pages.mjs <archivo.pdf> <carpeta-salida> [--pages 1-4] [--width 900]');
const out = resolve(outArg);
mkdirSync(out, { recursive: true });

const shellDir = 'node_modules/.remotion/chrome-headless-shell';
const entry = readdirSync(shellDir, { recursive: true, withFileTypes: true })
  .find((e) => e.isFile() && /^chrome-headless-shell(\.exe)?$/.test(e.name));
assert.ok(entry, 'Falta el Chrome headless de Remotion.');
const browser = await chromium.launch({ executablePath: join(entry.parentPath ?? entry.path, entry.name) });

try {
  const page = await browser.newPage();
  await page.goto(url);
  const b64 = readFileSync(resolve(file)).toString('base64');
  const result = await page.evaluate(async ({ b64, range, width }) => {
    const pdfjs = await import('/node_modules/pdfjs-dist/build/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/build/pdf.worker.min.mjs';
    const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const pdf = await pdfjs.getDocument({
      data,
      cMapUrl: '/pdfjs/cmaps/', standardFontDataUrl: '/pdfjs/standard_fonts/', wasmUrl: '/pdfjs/wasm/', iccUrl: '/pdfjs/iccs/',
    }).promise;
    const [from, to] = range ? range.split('-').map(Number) : [1, pdf.numPages];
    const pages = [];
    for (let n = from; n <= Math.min(to ?? from, pdf.numPages); n++) {
      const p = await pdf.getPage(n);
      const base = p.getViewport({ scale: 1 });
      const viewport = p.getViewport({ scale: width / base.width });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await p.render({ canvasContext: canvas.getContext('2d'), canvas, viewport }).promise;
      pages.push({ n, w: base.width, h: base.height, png: canvas.toDataURL('image/png').split(',')[1] });
    }
    return { total: pdf.numPages, pages };
  }, { b64, range, width });
  console.log(`${basename(file)}: ${result.total} páginas`);
  for (const p of result.pages) {
    const name = join(out, `p${String(p.n).padStart(2, '0')}.png`);
    writeFileSync(name, Buffer.from(p.png, 'base64'));
    console.log(`  p${p.n}: ${p.w.toFixed(0)}×${p.h.toFixed(0)} pt → ${name}`);
  }
} finally {
  await browser.close();
}
