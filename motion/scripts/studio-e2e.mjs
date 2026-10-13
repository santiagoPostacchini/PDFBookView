// Recorre el Estudio de la app de punta a punta en Chrome headless (el de Remotion):
// carga un PDF por el input real, abre el Estudio, toma una foto y arma y exporta un
// video con el editor (estilo → historia → textos → ambiente → exportar), como lo haría una persona.
// Sirve como prueba y para generar los videos de un álbum sin intervención.
//
//   node scripts/studio-e2e.mjs <pdf> [--mode booklet|simple] [--out out/e2e]
//        [--template clasica|ritmo|minimal] [--formats 9:16,1:1] [--duration 15]
//        [--text "Tus fotos, tu historia"] [--handle @tu.marca] [--drag]
//        [--view tresCuartos] [--spread 2] [--lighting calida] [--backdrop rosa]
//        [--no-video] [--no-photo]
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
const shot = async (name) => {
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(out, name) });
  log('captura:', name);
};

await page.goto(url);
await page.evaluate((mode) => {
  localStorage.clear();
  localStorage.setItem('pdf-book-view.mode', mode);
}, flag('mode', 'booklet'));
await page.reload();
await page.setInputFiles('input[type=file]', pdf);
await page.waitForSelector('.pager-label', { timeout: 60_000 });
log('libro cargado:', await page.textContent('.pager-label'));
if (await page.$('.sheet-editor')) await page.click('.sheet-editor button[aria-label="Cerrar editor"]');

await page.click('.topbar .btn:has-text("Estudio")');
await page.waitForSelector('.studio-panel');
const cameraCanvas = await page.locator('canvas.book-canvas').first().boundingBox();
const cameraBefore = await page.evaluate(() => window.bookEngine.getPose());
await page.mouse.move(cameraCanvas.x + cameraCanvas.width / 2, cameraCanvas.y + cameraCanvas.height / 2);
await page.mouse.down({ button: 'right' });
await page.mouse.move(cameraCanvas.x + cameraCanvas.width / 2 + 35, cameraCanvas.y + cameraCanvas.height / 2 + 8, { steps: 5 });
await page.mouse.up({ button: 'right' });
const cameraAfter = await page.evaluate(() => window.bookEngine.getPose());
if (Math.abs(cameraAfter.azimuth - cameraBefore.azimuth) < 1) throw new Error('Click derecho no mira');
await page.mouse.wheel(0, -180);
await page.waitForTimeout(350);
if ((await page.evaluate(() => window.bookEngine.getPose())).distance >= cameraAfter.distance) throw new Error('Rueda no acerca en Foto');


if (!has('no-photo')) {
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
  await shot('ui-foto.png');
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), page.click('button:has-text("Tomar foto")')]);
  const file = join(out, download.suggestedFilename());
  await download.saveAs(file);
  log('foto:', basename(file));
}

if (!has('no-video')) {
  await page.click('.studio-tabs button:has-text("Video")');
  await page.waitForSelector('.video-steps');
  await page.waitForSelector('.storyboard .scene-card');

  // 1. Estilo
  const template = { clasica: 'Clásica', ritmo: 'Ritmo', minimal: 'Minimal' }[flag('template', 'clasica')];
  await page.click(`.template-card:has-text("${template}")`);
  await shot('ui-video-1-estilo.png');

  // 2. Historia: una frase en la tercera escena (si se puede escribir ahí) y
  // reordenar arrastrando la última escena antes del cierre hasta la segunda posición.
  await page.click('.storyboard .scene-card >> nth=2');
  const order = () => page.$$eval('.storyboard .scene-card-label b', (els) => els.map((e) => e.textContent.replace(/^\d+\.\s*/, '')).join(' → '));
  if (has('drag')) {
    const cards = page.locator('.storyboard .scene-card');
    const from = await cards.nth((await cards.count()) - 2).boundingBox();
    const to = await cards.nth(1).boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 - 30, from.y + from.height / 2, { steps: 4 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
    await page.mouse.up();
    log('guion reordenado:', await order());
  } else {
    log('guion:', await order());
  }
  await shot('ui-video-2-historia.png');

  // 3. Textos independientes
  await page.click('.video-steps button:has-text("Textos")');
  if (flag('handle')) {
    await page.locator('.text-item-select').nth(3).click();
    await page.getByLabel('Texto', { exact: true }).fill(flag('handle'));
  }
  await page.locator('.text-item-select').nth(1).click();
  if (flag('text')) await page.getByLabel('Texto', { exact: true }).fill(flag('text'));
  await page.getByLabel('Inicio', { exact: true }).fill('0.2');
  await page.getByLabel('Duraci\u00f3n', { exact: true }).fill('2.5');
  await shot('ui-video-3-textos.png');

  await page.click('.video-steps button:has-text("Ambiente")');
  await page.getByRole('button', { name: 'Fondo Arena', exact: true }).click();
  await page.getByLabel('Usar mesa', { exact: true }).check();
  await page.getByRole('button', { name: 'Mantel Cuadros azul', exact: true }).click();
  await page.getByLabel('Color de fondo a elección', { exact: true }).fill('#a1b2c3');
  await page.waitForFunction(() => window.bookEngine.stageSet?.color === '#a1b2c3' && window.bookEngine.stageSet?.cloth?.tablecloth === 'vichy-azul');
  await shot('ui-video-4-ambiente.png');

  // 5. Exportar: formatos y duración.
  await page.click('.video-steps button:has-text("Exportar")');
  const formats = flag('formats', '9:16').split(',');
  for (const f of ['9:16', '4:5', '1:1', '16:9']) {
    const button = page.locator(`.format-option:has(b:text-is("${f}"))`);
    const on = (await button.getAttribute('aria-pressed')) === 'true';
    if (on !== formats.includes(f)) await button.click();
  }
  if (flag('duration')) await page.click(`.studio-section:has(h3:text("Duración total")) .chip:text-is("${flag('duration')} s")`);
  await shot('ui-video-5-exportar.png');

  const files = [];
  page.on('download', async (download) => {
    const file = join(out, download.suggestedFilename());
    files.push(download.saveAs(file).then(() => file));
  });
  await page.click('button:has-text("Exportar")>> nth=-1');
  let last = '';
  for (;;) {
    await page.waitForTimeout(1500);
    const text = await (await page.$('.record-progress span'))?.textContent();
    if (!text) break;
    if (text !== last) log(text);
    last = text;
  }
  await page.waitForSelector('.video-result', { timeout: 30_000 });
  for (const file of await Promise.all(files)) log('video:', basename(file));
  await shot('ui-video-listo.png');
}

await browser.close();

function cap(text) {
  const map = { calida: 'Cálida', dramatica: 'Dramática', fria: 'Fría' };
  return map[text] ?? text.charAt(0).toUpperCase() + text.slice(1);
}

function findExe(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && /^chrome-headless-shell(\.exe)?$/.test(entry.name)) return join(entry.parentPath ?? entry.path, entry.name);
  }
  throw new Error('No se encontró chrome-headless-shell (corré un render de Remotion una vez para descargarlo).');
}
