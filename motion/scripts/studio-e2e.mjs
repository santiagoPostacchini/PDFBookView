// Recorre el Estudio de la app de punta a punta en Chrome headless (el de Remotion):
// carga un PDF por el input real, abre el Estudio, toma una foto y exporta el video.
// Sirve como prueba y para generar el video promocional de un álbum sin intervención.
//
//   node scripts/studio-e2e.mjs <pdf> [--out out/e2e] [--style elegante] [--format 9:16]
//                               [--duration 15] [--view tresCuartos] [--spread 2]
//                               [--lighting calida] [--backdrop rosa] [--no-video] [--no-photo]
//
// Requiere la app corriendo (npm run dev en la raíz, http://localhost:5173).
import { mkdirSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const pdf = resolve(args[0] ?? '');
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);
const out = resolve(flag('out', 'out/e2e'));
const url = flag('url', 'http://localhost:5173/');
mkdirSync(out, { recursive: true });

const shellDir = 'node_modules/.remotion/chrome-headless-shell';
const exe = findExe(shellDir);
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=d3d11', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
page.on('pageerror', (err) => console.error('[pageerror]', err.message));
page.on('console', (msg) => msg.type() === 'error' && console.error('[console]', msg.text()));

const t0 = Date.now();
const log = (...m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...m);

await page.goto(url);
await page.evaluate(() => localStorage.setItem('pdf-book-view.mode', 'booklet'));
await page.reload();
await page.setInputFiles('input[type=file]', pdf);
await page.waitForSelector('.pager-label', { timeout: 60_000 });
log('libro cargado:', await page.textContent('.pager-label'));
if (await page.$('.sheet-editor')) await page.click('.sheet-editor button[aria-label="Cerrar editor"]');

await page.click('.topbar .btn:has-text("Estudio")');
await page.waitForSelector('.studio-panel');
if (flag('lighting')) await page.click(`.studio-section:has(h3:text("Luz")) .chip:text-is("${cap(flag('lighting'))}")`);
if (flag('backdrop')) await page.click(`.swatch[aria-label="Fondo ${cap(flag('backdrop'))}"]`);

// Doble página a fotografiar, esperando sus texturas en alta.
const spread = Number(flag('spread', '2'));
await page.evaluate((s) => window.bookEngine.goToSpread(s), spread);
await page.waitForFunction(
  (s) => {
    const tm = window.bookEngine.textures;
    return [2 * s - 1, 2 * s].every((p) => p < 0 || tm.fulls.has(p));
  },
  spread,
  { timeout: 180_000, polling: 500 },
);
if (flag('view')) {
  const labels = { frontal: 'Frontal', tresCuartos: '3/4', cenital: 'Cenital', rasante: 'Rasante', detalle: 'Detalle' };
  await page.click(`.studio-section:has(h3:text("Ángulo")) .chip:text-is("${labels[flag('view')]}")`);
}
await page.waitForTimeout(1500);
await page.screenshot({ path: join(out, 'ui-foto.png') });
log('captura de la interfaz: ui-foto.png');

if (!has('no-photo')) {
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), page.click('button:has-text("Tomar foto")')]);
  const file = join(out, download.suggestedFilename());
  await download.saveAs(file);
  log('foto:', basename(file));
}

if (!has('no-video')) {
  await page.click('.studio-tabs button:has-text("Video")');
  await page.click(`.studio-section:has(h3:text("Formato")) .chip:has-text("${flag('format', '9:16')}")`);
  await page.click(`.style-card:has-text("${cap(flag('style', 'elegante'))}")`);
  await page.click(`.studio-section:has(h3:text("Duración")) .chip:text-is("${flag('duration', '15')} s")`);
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(out, 'ui-video.png') });
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 900_000 }),
    page.click('button:has-text("Exportar MP4")'),
    (async () => {
      // Progreso en la consola mientras graba.
      for (let i = 0; i < 900; i++) {
        await page.waitForTimeout(3000);
        const text = await page.textContent('.record-progress span').catch(() => null);
        if (!text) break;
        log(text);
      }
    })(),
  ]);
  const file = join(out, download.suggestedFilename());
  await download.saveAs(file);
  log('video:', basename(file));
  await page.screenshot({ path: join(out, 'ui-video-listo.png') });
}

await browser.close();

function cap(text) {
  const map = { calida: 'Cálida', dramatica: 'Dramática', fria: 'Fría', dinamico: 'Dinámico' };
  return map[text] ?? text.charAt(0).toUpperCase() + text.slice(1);
}

function findExe(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && /^chrome-headless-shell(\.exe)?$/.test(entry.name)) return join(entry.parentPath ?? entry.path, entry.name);
  }
  throw new Error('No se encontró chrome-headless-shell (corré un render de Remotion una vez para descargarlo).');
}
