// Movimiento opcional por toma: controles, dos puntos, persistencia y reproducción.
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
const entry = readdirSync('node_modules/.remotion/chrome-headless-shell', { recursive: true, withFileTypes: true })
  .find((e) => e.isFile() && /^chrome-headless-shell(\.exe)?$/.test(e.name));
const browser = await chromium.launch({ executablePath: join(entry.parentPath ?? entry.path, entry.name), args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(process.argv[2] ?? 'http://127.0.0.1:5175/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('pdf-book-view.mode', 'simple'); });
  const load = async () => {
    await page.reload(); await page.setInputFiles('.topbar input[type=file]', 'out/demo/album-demo.pdf');
    await page.waitForFunction(() => window.promoLab && window.bookEngine?.currentBook);
    await page.getByRole('button', { name: 'Estudio', exact: true }).click();
    await page.getByRole('tab', { name: 'Video promocional' }).click();
    await page.locator('.storyboard .scene-card').first().click();
  };
  await load();
  assert.equal(await page.locator('.scene-content details').getAttribute('open'), null);
  await page.getByText('Movimiento (opcional)', { exact: true }).click();
  const zoom = page.getByRole('checkbox', { name: 'Activar zoom suave', exact: true });
  const lateral = page.getByRole('checkbox', { name: 'Activar movimiento lateral', exact: true });
  assert.equal(await zoom.isChecked(), false); assert.equal(await lateral.isChecked(), false);
  const framing = page.getByRole('slider', { name: /^Acercamiento de esta toma/ });
  await framing.focus(); await framing.press('Home');
  for (let i = 0; i < 50; i++) await framing.press('ArrowRight');
  await zoom.check(); await lateral.check();
  const slider = (label) => page.getByRole('slider', { name: new RegExp(`^${label}`) });
  const setSlider = async (label, steps) => {
    const input = slider(label); await input.focus(); await input.press('Home');
    for (let i = 0; i < steps; i++) await input.press('ArrowRight');
  };
  await setSlider('Zoom inicial', 2); await setSlider('Zoom final', 8); await setSlider('Recorrido lateral', 10);
  await page.getByRole('radio', { name: 'Cámara hacia izquierda', exact: true }).click();
  const orbit = page.getByRole('checkbox', { name: 'Girar alrededor del centro del álbum', exact: true });
  await orbit.check();
  const pose = () => page.evaluate(() => ({ position: window.bookEngine.camera.position.toArray(), target: window.bookEngine.controls.target.toArray() }));
  await page.getByRole('button', { name: 'Ver punto inicial', exact: true }).click(); const first = await pose();
  await page.getByRole('button', { name: 'Ver punto final', exact: true }).click(); const last = await pose();
  assert.notDeepEqual(first.position, last.position); assert.deepEqual(first.target, last.target);
  await page.getByRole('button', { name: 'Ver esta toma', exact: true }).click();
  await page.getByRole('button', { name: 'Detener', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Reproducir desde el principio', exact: true }).waitFor({ timeout: 15000 });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('pdf-book-view.video:album-demo.pdf'))?.project.scenes[0].camera?.zoom.to === 0.08);
  await load();
  assert.notEqual(await page.locator('.scene-content details').getAttribute('open'), null, 'Los ajustes guardados abren Movimiento.');
  assert.equal(await framing.inputValue(), '0.5');
  assert.equal(await zoom.isChecked(), true); assert.equal(await lateral.isChecked(), true);
  assert.equal(await orbit.isChecked(), true);
  assert.equal(await slider('Zoom inicial').inputValue(), '0.02'); assert.equal(await slider('Zoom final').inputValue(), '0.08');
  assert.equal(await slider('Recorrido lateral').inputValue(), '0.1');
  assert.equal(await page.getByRole('radio', { name: 'Cámara hacia izquierda', exact: true }).isChecked(), true);
  await zoom.uncheck(); await lateral.uncheck();
  await page.getByRole('button', { name: 'Ver punto inicial', exact: true }).click(); const fixedFirst = await pose();
  await page.getByRole('button', { name: 'Ver punto final', exact: true }).click(); const fixedLast = await pose();
  for (const field of ['position', 'target']) fixedFirst[field].forEach((v, i) => assert.ok(Math.abs(v - fixedLast[field][i]) < 1e-6));
  await zoom.check(); assert.equal(await slider('Zoom final').inputValue(), '0.08');
  await page.locator('.storyboard .scene-card').nth(1).click();
  assert.equal(await page.locator('.scene-content details').getAttribute('open'), null, 'Otra toma sin ajustes queda plegada.');
  await page.getByText('Movimiento (opcional)', { exact: true }).click();
  assert.equal(await zoom.isChecked(), false); assert.equal(await lateral.isChecked(), false);
  await page.getByRole('button', { name: 'Cerrar estudio', exact: true }).click();
  const bytes = await page.evaluate(async () => {
    const { bookEngine: engine, promoLab: lab } = window;
    const project = lab.projectFromTemplate('clasica', { format: '16:9' });
    project.scenes = [{ kind: 'doblePagina' }, { kind: 'cenital' }, { kind: 'detalle' }, { kind: 'cierre' }, { kind: 'portada' }];
    project.scenes[0].camera = { zoom: { enabled: true, from: 0.02, to: 0.08 }, lateral: { enabled: true, amount: 0.1, direction: 'izquierda', orbit: true } };
    const timeline = lab.compileProject(project, engine.currentBook);
    const { drawOverlay, overlayTheme } = await import('/src/promo/overlay.ts');
    const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 540;
    const ctx = canvas.getContext('2d'); const calls = [];
    ctx.fillText = (text) => { if (ctx.globalAlpha > 0.5) calls.push(text); };
    drawOverlay(ctx, timeline, 0, overlayTheme('#f4e9dc'));
    if (!calls.join(' ').includes(project.texts.title)) throw new Error('Título ausente en la primera toma');
    calls.length = 0; drawOverlay(ctx, timeline, timeline.scenes[4].start, overlayTheme('#f4e9dc'));
    if (calls.join(' ').includes(project.texts.title)) throw new Error('Título repetido en la quinta toma');
    timeline.width = 480; timeline.height = 270;
    const seen = []; const original = engine.applyPose.bind(engine);
    engine.applyPose = (pose, ...args) => { seen.push([...pose.target, pose.distance]); return original(pose, ...args); };
    try {
      const blob = await lab.recordTimeline(engine, timeline, { fps: 12 });
      if (new Set(seen.map((v) => JSON.stringify(v))).size < 10) throw new Error('La exportación debe recorrer los puntos de cámara.');
      return blob.size;
    } finally { engine.applyPose = original; }
  });
  assert.ok(bytes > 10000, 'MP4 real con cámara opcional');
  assert.deepEqual(errors, []);
  console.log(`Cámara en verde: controles por toma, dos puntos, reproducción acotada, persistencia, desactivación y MP4 real (${bytes} bytes).`);
} finally { await browser.close(); }
