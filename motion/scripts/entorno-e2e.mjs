// Regresión del título inicial, ventana independiente, mesa y oclusión ambiental.
import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
const entry = readdirSync('node_modules/.remotion/chrome-headless-shell', { recursive: true, withFileTypes: true })
  .find((e) => e.isFile() && /^chrome-headless-shell(\.exe)?$/.test(e.name));
const out = resolve('out/entorno'); mkdirSync(out, { recursive: true });
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
  };
  await load();
  // Aunque quedó elegido el cierre, el botón principal debe volver al título.
  await page.locator('.storyboard .scene-card').last().click();
  await page.evaluate(() => {
    window.__titleCalls = [];
    const ctx = window.bookEngine.overlay.canvas.getContext('2d');
    const original = ctx.fillText.bind(ctx);
    ctx.fillText = (text, ...args) => { if (ctx.globalAlpha > 0.5) window.__titleCalls.push(text); original(text, ...args); };
  });
  await page.getByRole('button', { name: 'Reproducir desde el principio', exact: true }).click();
  await page.waitForFunction(() => window.__titleCalls.join(' ').includes('Álbum personalizado'));
  await page.locator('.storyboard-play').click();
  await page.getByRole('tab', { name: 'Estilo', exact: false }).first().click();
  const slider = (label) => page.getByRole('slider', { name: new RegExp(`^${label}`) });
  const setSlider = async (label, steps) => {
    const input = slider(label); await input.focus(); await input.press('Home');
    for (let i = 0; i < steps; i++) await input.press('ArrowRight');
  };
  await page.locator('.video-steps button').filter({ hasText: 'Historia' }).click();
  await page.getByRole('button', { name: 'Agregar una escena', exact: true }).click();
  await page.locator('.style-card').filter({ hasText: 'Figuritas' }).click();
  await page.getByLabel('Cargar figuritas', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Ver cómo se pegan', exact: true }).isDisabled(), true);
  await page.getByRole('tab', { name: 'Ambiente', exact: false }).first().click();
  await page.getByRole('button', { name: 'Mantel Cuadros azul', exact: false }).click();
  await setSlider('Sombra de ventana', 15);
  await page.getByText('Más ajustes', { exact: true }).click();
  await setSlider('Sombras de contacto', 12);
  await page.waitForFunction(() => window.bookEngine.stageSet?.cloth?.tablecloth === 'vichy-azul' && window.bookEngine.stageSet?.windowStrength === 0.75);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('pdf-book-view.video:album-demo.pdf'))?.project.ambientOcclusion === 0.6);
  await load();
  await page.getByRole('tab', { name: 'Ambiente', exact: false }).first().click();
  assert.equal(await slider('Sombra de ventana').inputValue(), '0.75');
  await page.getByText('Más ajustes', { exact: true }).click();
  assert.equal(await slider('Sombras de contacto').inputValue(), '0.6');
  await setSlider('Sombra de ventana', 0);
  await page.waitForFunction(() => window.bookEngine.stage.set.key.map === null);
  await page.getByRole('button', { name: 'Cerrar estudio', exact: true }).click();
  const result = await page.evaluate(async () => {
    const { bookEngine: engine, promoLab: lab } = window;
    const { drawOverlay, overlayTheme, loadTypography } = await import('/src/promo/overlay.ts');
    const project = lab.projectFromTemplate('clasica'); project.cloth = 'mantel-azul'; project.format = '16:9';
    const timeline = lab.compileProject(project, engine.currentBook);
    await loadTypography(timeline.typography); engine.enterStudio();
    const titleCanvas = document.createElement('canvas'); titleCanvas.width = 960; titleCanvas.height = 540;
    const c = titleCanvas.getContext('2d'); const calls = []; const fill = c.fillText.bind(c);
    c.fillText = (text, ...args) => { calls.push({ text, alpha: c.globalAlpha }); fill(text, ...args); };
    drawOverlay(c, timeline, 0, overlayTheme('#f4e9dc'));
    const initial = calls.filter((v) => v.alpha > 0.5).map((v) => v.text).join(' ');
    calls.length = 0; drawOverlay(c, timeline, timeline.duration - 0.1, overlayTheme('#f4e9dc'));
    const ending = calls.filter((v) => v.alpha > 0.5).map((v) => v.text).join(' ');
    timeline.width = 960; timeline.height = 540;
    const first = (await lab.renderStills(engine, timeline, [0]))[0];
    const shots = [{ name: 'titulo-inicio.png', bytes: [...new Uint8Array(await first.arrayBuffer())] }];
    const { resolveCloth } = await import('/src/book/scenarios.ts');
    const base = { ...lab.SET_PRESETS[0], cloth: resolveCloth('mantel-azul') };
    const measurements = await engine.renderSession(960, 540, 36, async (draw, source) => {
      const copy = document.createElement('canvas'); copy.width = 960; copy.height = 540; const ctx = copy.getContext('2d');
      const images = [];
      for (const strength of [0, 0.5, 1]) {
        engine.setSet({ ...base, table: true, windowShadow: strength > 0, windowStrength: strength });
        engine.applyPose({ azimuth: -25, elevation: 30, distance: 16, target: [0, -0.6, 0] });
        engine.setLook({ aperture: 0, grain: 0, vignette: 0, ambientOcclusion: 0.35 });
        draw(0); ctx.drawImage(source, 0, 0); images.push(ctx.getImageData(0, 0, 960, 540).data);
        const blob = await new Promise((r) => copy.toBlob(r));
        shots.push({ name: `mesa-ventana-${strength}.png`, bytes: [...new Uint8Array(await blob.arrayBuffer())] });
      }
      const sum = (a) => a.reduce((s, v, i) => s + (i % 4 === 3 ? 0 : v), 0);
      const brightness = images.map(sum);
      engine.setLook({ ambientOcclusion: 0 }); draw(0); ctx.drawImage(source, 0, 0);
      const noAO = ctx.getImageData(0, 0, 960, 540).data;
      let aoChanged = 0; for (let i = 0; i < noAO.length; i += 4) if (noAO[i] !== images[2][i] || noAO[i + 1] !== images[2][i + 1] || noAO[i + 2] !== images[2][i + 2]) aoChanged++;
      const table = engine.stage.set;
      return { brightness, aoChanged, finite: table.floor.scale.x < 0.1, legs: table.legs.filter((l) => l.visible).length };
    });
    return { initial, ending, measurements, shots };
  });
  assert.match(result.initial, /Álbum personalizado/); assert.doesNotMatch(result.ending, /Álbum personalizado/);
  assert.equal(result.measurements.finite, true); assert.equal(result.measurements.legs, 4);
  const [off, middle, full] = result.measurements.brightness;
  assert.ok(off > middle && middle > full, 'La sombra se intensifica gradualmente');
  assert.ok(result.measurements.aoChanged > 100, 'La oclusión debe afectar el apoyo real');
  for (const shot of result.shots) writeFileSync(join(out, shot.name), Buffer.from(shot.bytes));
  assert.deepEqual(errors, []);
  if (process.argv.includes('--video')) {
    const video = await page.evaluate(async () => {
      const { bookEngine: engine, promoLab: lab } = window;
      const project = lab.projectFromTemplate('clasica', { format: '16:9', cloth: 'mantel-azul', windowShadow: 0.65 });
      const timeline = lab.compileProject(project, engine.currentBook);
      timeline.width = 640; timeline.height = 360;
      return lab.blobToBase64(await lab.recordTimeline(engine, timeline, { fps: 24 }));
    });
    writeFileSync(join(out, 'planos-fijos.mp4'), Buffer.from(video, 'base64'));
  }
  console.log(`Entorno en verde: título en cuadro 0 y separado del cierre, ventana sobre mantel graduable y recordada, mesa finita con cuatro patas, AO actúa sobre ${result.measurements.aoChanged} píxeles.`);
} finally { await browser.close(); }
