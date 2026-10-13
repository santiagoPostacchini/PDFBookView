// Desde motion/: node scripts/text-items-e2e.mjs [URL]
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
const entry = readdirSync('node_modules/.remotion/chrome-headless-shell', { recursive: true, withFileTypes: true }).find(e => e.isFile() && /^chrome-headless-shell(\.exe)?$/.test(e.name));
const browser = await chromium.launch({ executablePath: join(entry.parentPath ?? entry.path, entry.name), args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.argv[2] ?? 'http://127.0.0.1:5173/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('pdf-book-view.mode', 'simple'); });
  const open = async () => {
    await page.reload(); await page.setInputFiles('.topbar input[type=file]', 'out/demo/album-demo.pdf');
    await page.waitForFunction(() => window.promoLab && window.bookEngine?.currentBook);
    await page.getByRole('button', { name: 'Estudio', exact: true }).click();
    await page.getByRole('tab', { name: 'Video promocional' }).click();
    await page.locator('.video-steps button').nth(2).click();
  };
  await open();
  while (await page.locator('.text-item-row').count()) await page.getByRole('button', { name: 'Borrar texto', exact: true }).click();
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Agregar texto', exact: true }).click();
    await page.getByLabel('Texto', { exact: true }).fill(`Texto propio ${i + 1}\nOtra línea`);
    await page.getByLabel('Inicio', { exact: true }).fill('0');
    await page.getByLabel('Duración', { exact: true }).fill('10');
    await page.getByRole('slider', { name: new RegExp("Posición Y") }).fill(String(.2 + i * .25));
    await page.getByLabel('Subir fuente', { exact: true }).setInputFiles('../public/fonts/caveat-normal-600.woff2');
    await page.waitForFunction(n => document.querySelectorAll('.studio-section [role=radio][aria-checked=true]').length > 0 && document.querySelectorAll('.studio-section button[aria-label^="Quitar fuente"]').length === n, i + 1);
  }
  await page.locator('.text-item-select').first().click();
  const box = page.locator('.text-selection.is-selected');
  await box.waitFor();
  const before = await box.boundingBox();
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down(); await page.mouse.move(before.x + before.width / 2 + 35, before.y + before.height / 2 + 20, { steps: 5 }); await page.mouse.up();
  assert.ok(Number(await page.getByRole('slider', { name: new RegExp("Posición X") }).inputValue()) > .5);
  await box.focus(); const x = Number(await page.getByRole('slider', { name: new RegExp("Posición X") }).inputValue());
  await page.keyboard.press('Shift+ArrowRight');
  assert.ok(Math.abs(Number(await page.getByRole('slider', { name: new RegExp("Posición X") }).inputValue()) - x - .05) < .002);
  await page.locator('.text-item-select').nth(1).click();
  const size = Number(await page.getByRole('slider', { name: new RegExp("Tamaño") }).inputValue());
  const handle = await page.locator('.text-scale-handle').boundingBox();
  await page.mouse.move(handle.x + 8, handle.y + 8); await page.mouse.down(); await page.mouse.move(handle.x + 50, handle.y + 30, { steps: 5 }); await page.mouse.up();
  assert.ok(Number(await page.getByRole('slider', { name: new RegExp("Tamaño") }).inputValue()) > size);
  await page.getByLabel('Color propio', { exact: true }).fill('#c43a3a');
  await page.getByLabel('Duración', { exact: true }).fill('4.2');
  await page.waitForTimeout(450);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pdf-book-view.video:album-demo.pdf')).project.textItems);
  await open();
  const loaded = await page.evaluate(() => JSON.parse(localStorage.getItem('pdf-book-view.video:album-demo.pdf')).project.textItems);
  assert.deepEqual(loaded, saved); assert.equal(loaded.length, 3);
  assert.equal(new Set(loaded.map(t => t.font)).size, 3); assert.ok(loaded.every(t => t.font.startsWith('user:')));
  assert.equal(loaded[1].color, '#c43a3a'); assert.equal(loaded[1].duration, 4.2);
  await page.locator('.text-item-select').nth(1).click();
  await page.getByLabel('Tiempo de la vista previa (segundos)', { exact: true }).fill('12');
  assert.ok(await page.locator('.text-selection.is-selected.is-inactive').count());
  const result = await page.evaluate(async () => {
    const project = JSON.parse(localStorage.getItem('pdf-book-view.video:album-demo.pdf')).project;
    project.duration = 2; project.scenes = [{ kind: 'portada' }];
    project.textItems = project.textItems.map(t => ({ ...t, start: 0, duration: 2 }));
    const timeline = window.promoLab.compileProject(project, window.bookEngine.currentBook);
    timeline.width = 360; timeline.height = 640;
    const blob = await window.promoLab.recordTimeline(window.bookEngine, timeline, { fps: 10 });
    // Decodificar el MP4 real: el azul de la selección DOM no debe aparecer.
    const video = document.createElement('video'); video.muted = true; video.src = URL.createObjectURL(blob);
    await new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = reject; });
    const canvas = document.createElement('canvas'); canvas.width = 360; canvas.height = 640;
    const ctx = canvas.getContext('2d'); ctx.drawImage(video, 0, 0, 360, 640);
    const pixels = ctx.getImageData(0, 0, 360, 640).data;
    let blue = 0; for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 75 && pixels[i + 1] > 80 && pixels[i + 1] < 155 && pixels[i + 2] > 180) blue++;
    URL.revokeObjectURL(video.src); return { bytes: blob.size, blue };
  });
  assert.ok(result.bytes > 1000); assert.equal(result.blue, 0, 'MP4 sin cajas ni manijas azules');
  assert.deepEqual(errors, []);
  console.log('Textos: crear, fuente propia, mover, teclado, escalar, color, duración, recarga y MP4 sin selección: OK', result);
} finally { await browser.close(); }
