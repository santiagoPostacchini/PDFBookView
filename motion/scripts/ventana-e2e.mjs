// Muestra genérica de Luz de ventana para revisión visual.
import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
const entry = readdirSync('node_modules/.remotion/chrome-headless-shell', { recursive: true, withFileTypes: true })
  .find((e) => e.isFile() && /^chrome-headless-shell(\.exe)?$/.test(e.name));
const out = resolve('out/ventana'); mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: join(entry.parentPath ?? entry.path, entry.name), args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  await page.goto(process.argv[2] ?? 'http://127.0.0.1:5175/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('pdf-book-view.mode', 'simple'); });
  await page.reload(); await page.setInputFiles('.topbar input[type=file]', 'out/demo/album-demo.pdf');
  await page.waitForFunction(() => window.promoLab && window.bookEngine?.currentBook);
  await page.getByRole('button', { name: 'Estudio', exact: true }).click();
  await page.getByRole('tab', { name: 'Video promocional' }).click();
  await page.getByRole('button', { name: 'Ambiente', exact: false }).first().click();
  await page.getByRole('button', { name: 'Escenario Luz de ventana', exact: true }).click();
  await page.waitForFunction(() => window.bookEngine.stageSet?.windowShadow === true);
  assert.equal(await page.getByRole('button', { name: 'Escenario Luz de ventana', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: 'Escenario Arena', exact: true }).click();
  await page.getByRole('slider', { name: /^Sombra de ventana/ }).focus();
  await page.getByRole('slider', { name: /^Sombra de ventana/ }).press('Home');
  await page.waitForFunction(() => !window.bookEngine.stageSet?.windowShadow);
  assert.equal(await page.getByRole('button', { name: 'Escenario Luz de ventana', exact: true }).getAttribute('aria-pressed'), 'false');
  await page.getByRole('button', { name: 'Cerrar estudio', exact: true }).click();
  const result = await page.evaluate(async () => {
    const { bookEngine: engine, promoLab: lab } = window;
    engine.enterStudio();
    const preset = lab.SET_PRESETS.find((s) => s.id === 'ventana');
    engine.setSet(preset);
    const projected = engine.stage.set.key.map !== null;
    const timeline = lab.compileProject(lab.projectFromTemplate('ventana'), engine.currentBook);
    timeline.width = 640; timeline.height = Math.round(640 / timeline.aspect);
    const scenes = [timeline.scenes[0], timeline.scenes[2], timeline.scenes[3]];
    const blobs = await lab.renderStills(engine, timeline, scenes.map((s) => s.start + (s.end - s.start) * 0.65));
    const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 610;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#201e1c'; ctx.fillRect(0, 0, 960, 610);
    for (let i = 0; i < blobs.length; i++) {
      const image = await createImageBitmap(blobs[i]); ctx.drawImage(image, i * 320 + 10, 42, 300, 533); image.close();
      ctx.fillStyle = '#ffffff'; ctx.font = '18px sans-serif'; ctx.fillText(scenes[i].label, i * 320 + 12, 28);
    }
    return { projected, surface: preset.surface, contact: canvas.toDataURL('image/png').split(',')[1] };
  });
  assert.equal(result.projected, true); assert.equal(result.surface, 'lino');
  writeFileSync(join(out, 'hoja-contacto.png'), Buffer.from(result.contact, 'base64'));
  console.log('Luz de ventana: proyección y lino en verde; muestra en out/ventana/hoja-contacto.png.');
} finally { await browser.close(); }
