// Miniaturas de las plantillas del editor de video (public/promo/plantilla-<id>.jpg),
// renderizadas con el álbum de ejemplo: así cada tarjeta de estilo muestra cómo se ve.
// Volver a correrlo cuando cambie el look de una plantilla.
//
//   node scripts/template-previews.mjs [--pdf out/demo/album-demo.pdf] [--width 240]
//
// Requiere la app corriendo (npm run dev en la raíz, http://localhost:5173).
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const pdf = resolve(flag('pdf', 'out/demo/album-demo.pdf'));
const width = Number(flag('width', '240'));
const out = resolve('..', 'public', 'promo');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: findExe('node_modules/.remotion/chrome-headless-shell'),
  args: ['--use-angle=d3d11', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
page.on('pageerror', (err) => console.error('[pageerror]', err.message));
await page.goto(flag('url', 'http://localhost:5173/'));
await page.evaluate(() => localStorage.setItem('pdf-book-view.mode', 'simple'));
await page.reload();
await page.setInputFiles('input[type=file]', pdf);
await page.waitForFunction(() => window.promoLab && window.bookEngine?.currentBook, null, { timeout: 60_000 });

const previews = await page.evaluate(async (w) => {
  const { promoLab: lab, bookEngine: engine } = window;
  engine.enterStudio();
  const out = {};
  for (const template of lab.TEMPLATES) {
    const timeline = lab.compileProject(lab.projectFromTemplate(template.id, { format: '9:16' }), engine.currentBook);
    const portada = timeline.scenes[0];
    const [png] = await lab.renderStills(engine, timeline, [portada.start + (portada.end - portada.start) * 0.62]);
    const bitmap = await createImageBitmap(png);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = Math.round((w * bitmap.height) / bitmap.width);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    out[template.id] = canvas.toDataURL('image/jpeg', 0.84).split(',')[1];
  }
  return out;
}, width);

for (const [id, b64] of Object.entries(previews)) {
  const file = join(out, `plantilla-${id}.jpg`);
  writeFileSync(file, Buffer.from(b64, 'base64'));
  console.log(`${file} (${(Buffer.byteLength(b64, 'base64') / 1024).toFixed(1)} KB)`);
}
await browser.close();

function findExe(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && /^chrome-headless-shell(\.exe)?$/.test(entry.name)) return join(entry.parentPath ?? entry.path, entry.name);
  }
  throw new Error('No se encontró chrome-headless-shell (corré un render de Remotion una vez para descargarlo).');
}
