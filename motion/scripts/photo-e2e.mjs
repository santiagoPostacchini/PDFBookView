// Verifica el escenario de Foto, su persistencia y los píxeles de los PNG.
// Con npm run dev en la raíz:
//   node scripts/photo-e2e.mjs out/demo/album-demo.pdf [--out out/foto-e2e]
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const pdf = resolve(args[0] ?? 'out/demo/album-demo.pdf');
const out = resolve(flag('out', 'out/foto-e2e'));
mkdirSync(out, { recursive: true });
const shellDir = 'node_modules/.remotion/chrome-headless-shell';
const entry = readdirSync(shellDir, { recursive: true, withFileTypes: true })
  .find((e) => e.isFile() && /^chrome-headless-shell(\.exe)?$/.test(e.name));
assert.ok(entry, 'Falta el Chrome headless de Remotion.');
const browser = await chromium.launch({
  executablePath: join(entry.parentPath ?? entry.path, entry.name),
  args: ['--use-angle=d3d11', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'],
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto(flag('url', 'http://localhost:5173/'));
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('pdf-book-view.mode', 'simple');
    // Ajustes anteriores a T-006: todavía no tenían superficie.
    localStorage.setItem('pdf-book-view.studio', JSON.stringify({ backdrop: 'rosa', lighting: 'calida' }));
  });
  const loadBook = async () => {
    await page.reload();
    await page.setInputFiles('input[type=file]', pdf);
    await page.waitForSelector('.pager-label', { timeout: 60_000 });
    await page.getByRole('button', { name: 'Estudio', exact: true }).click();
    await page.waitForSelector('.studio-panel');
  };
  const set = () => page.evaluate(() => window.bookEngine.stageSet);
  const surface = (label) => page.locator('.studio-section').filter({ has: page.locator('h3', { hasText: 'Escenario' }) })
    .getByRole('radio', { name: label, exact: true });
  const waitSet = (expected) => page.waitForFunction(
    (value) => Object.entries(value).every(([key, v]) => window.bookEngine.stageSet?.[key] === v), expected,
  );
  const takePhoto = async (name) => {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 120_000 }),
      page.getByRole('button', { name: 'Tomar foto', exact: true }).click(),
    ]);
    const path = join(out, name);
    await download.saveAs(path);
    return path;
  };
  const pixels = (path) => page.evaluate(async (base64) => {
    const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
    const image = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let clear = 0;
    let opaque = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] === 0) clear++;
      if (data[i] === 255) opaque++;
    }
    image.close();
    return { width: canvas.width, height: canvas.height, clear, opaque, total: data.length / 4 };
  }, readFileSync(path).toString('base64'));

  await loadBook();
  await waitSet({ surface: 'papel', color: '#fbdde3' });
  for (const [label, id] of [['Lisa', 'liso'], ['Papel', 'papel'], ['Lino', 'lino']]) {
    await surface(label).click();
    await waitSet({ surface: id });
  }
  await page.getByLabel('Color de fondo a elección').fill('#a1b2c3');
  await waitSet({ surface: 'lino', color: '#a1b2c3' });
  await loadBook();
  await waitSet({ surface: 'lino', color: '#a1b2c3' });
  assert.equal(await surface('Lino').getAttribute('aria-checked'), 'true');

  // Cambiar de pestaña no debe dejar el escenario del video en Foto.
  await page.getByRole('tab', { name: 'Video promocional' }).click();
  await page.waitForSelector('.storyboard .scene-card');
  await page.waitForFunction(() => window.bookEngine.stageSet?.color !== '#a1b2c3');
  await page.getByRole('tab', { name: 'Foto', exact: true }).click();
  await waitSet({ surface: 'lino', color: '#a1b2c3' });
  await page.evaluate(async () => {
    const engine = window.bookEngine;
    engine.goToSpread(2);
    await engine.preloadPages([3, 4]);
  });
  await page.getByRole('button', { name: '3/4', exact: true }).click();
  await page.waitForFunction(() => !window.bookEngine.cameraTween);
  await page.getByRole('radio', { name: '2K', exact: true }).click();
  const opaque = await pixels(await takePhoto('foto-lino.png'));
  assert.equal(opaque.height, 2048);
  assert.equal(opaque.width, 1638);
  assert.equal(opaque.opaque, opaque.total, 'El escenario debe cubrir el PNG opaco.');
  await page.locator('.studio-scroll').evaluate((el) => { el.scrollTop = 0; });
  await page.screenshot({ path: join(out, 'ui-foto-lino.png') });

  // La API también debe poder quitar temporalmente un escenario activo.
  const api = await page.evaluate(async () => {
    const engine = window.bookEngine;
    const spec = engine.stageSet;
    const background = engine.scene.background;
    const fog = engine.scene.fog;
    const blob = await engine.capturePhoto({ longSide: 512, type: 'image/png', transparent: true });
    const image = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const alpha = ctx.getImageData(0, 0, 1, 1).data[3];
    image.close();
    return { alpha, restored: engine.stageSet === spec && engine.scene.background === background,
      fogRestored: engine.scene.fog?.color.equals(fog.color) };
  });
  assert.equal(api.alpha, 0, 'La captura transparente por API debe quitar el escenario.');
  assert.ok(api.restored && api.fogRestored, 'La captura debe restaurar escenario, fondo y niebla.');

  await page.getByLabel('Fondo transparente', { exact: true }).click();
  await page.waitForFunction(() => window.bookEngine.stageSet === null && window.bookEngine.scene.fog === null);
  assert.equal(await surface('Lino').count(), 0);
  const transparent = await pixels(await takePhoto('foto-transparente.png'));
  assert.ok(transparent.clear > transparent.total * 0.1, 'Falta el fondo transparente.');
  assert.ok(transparent.opaque > transparent.total * 0.01, 'El libro debe seguir visible.');
  assert.equal(await set(), null);
  await page.getByRole('radio', { name: 'JPG', exact: true }).click();
  await waitSet({ surface: 'lino', color: '#3d3832' });
  await page.getByRole('radio', { name: 'PNG', exact: true }).click();
  await page.getByLabel('Fondo Rosa', { exact: true }).click();
  await waitSet({ surface: 'lino', color: '#e9c6c2' });
  // Nuevos escenarios de Foto: dibujo, persistencia y retiro real.
  for (const [label, pattern] of [['cuadros rosa', 'vichy-rosa'], ['cuadros azul', 'vichy-azul'], ['rayas salvia', 'rayas-salvia']]) {
    await page.getByRole('button', { name: `Mantel · ${label}` }).click();
    await waitSet({ surface: 'lino', tablecloth: pattern });
    await loadBook();
    await waitSet({ surface: 'lino', tablecloth: pattern });
  }
  await page.getByLabel('Fondo Luz de ventana', { exact: true }).click();
  await waitSet({ surface: 'lino', windowShadow: true });
  await loadBook();
  await waitSet({ surface: 'lino', windowShadow: true });
  await page.getByLabel('Fondo transparente', { exact: true }).click();
  await page.waitForFunction(() => window.bookEngine.stageSet === null);
  await page.getByLabel('Fondo Rosa', { exact: true }).click();
  await waitSet({ surface: 'lino', color: '#e9c6c2' });
  assert.ok(!(await set()).tablecloth && !(await set()).windowShadow, 'Volver a un color retira mantel y ventana.');
  await page.getByRole('button', { name: 'Cerrar estudio', exact: true }).click();
  await page.waitForFunction(() => window.bookEngine.stageSet === null && window.bookEngine.scene.background === null);
  assert.deepEqual(errors, [], 'Hubo errores de ejecución en la app.');
  console.log('Foto en verde: superficies, color propio, persistencia, Foto ↔ Video, PNG opaco/transparente, JPG y salida del Estudio.');
} finally {
  await browser.close();
}
