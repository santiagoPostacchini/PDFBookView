// Escenarios de tela, persistencia y antialiasing sobre el álbum genérico.
import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
const entry = readdirSync('node_modules/.remotion/chrome-headless-shell', { recursive: true, withFileTypes: true })
  .find((e) => e.isFile() && /^chrome-headless-shell(\.exe)?$/.test(e.name));
const out = resolve('out/manteles'); mkdirSync(out, { recursive: true });
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
    await page.getByRole('tab', { name: 'Ambiente', exact: false }).first().click();
  };
  await load();
  for (const [label, pattern] of [['cuadros rosa', 'vichy-rosa'], ['cuadros azul', 'vichy-azul'], ['rayas salvia', 'rayas-salvia']]) {
    await page.getByRole('button', { name: `Mantel ${label[0].toUpperCase() + label.slice(1)}`, exact: false }).click();
    await page.waitForFunction((value) => window.bookEngine.stageSet?.cloth?.tablecloth === value, pattern);
  }
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('pdf-book-view.video:album-demo.pdf'))?.project.cloth === 'mantel-rayas');
  await load();
  await page.waitForFunction(() => window.bookEngine.stageSet?.cloth?.tablecloth === 'rayas-salvia');
  await page.getByRole('button', { name: 'Fondo Arena', exact: true }).click();
  await page.waitForFunction(() => window.bookEngine.stageSet?.color === '#dcc6a8' && window.bookEngine.stageSet?.cloth?.tablecloth === 'rayas-salvia');
  await page.getByLabel('Usar mesa', { exact: true }).uncheck();
  await page.waitForFunction(() => window.bookEngine.stageSet?.table === false);
  await page.getByLabel('Usar mesa', { exact: true }).check();
  await page.getByLabel('Color de mantel a elección', { exact: true }).fill('#123456');
  await page.getByLabel('Color de fondo a elección', { exact: true }).fill('#a1b2c3');
  await page.waitForFunction(() => window.bookEngine.stageSet?.color === '#a1b2c3' && window.bookEngine.stageSet?.cloth?.color === '#123456');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('pdf-book-view.video:album-demo.pdf'))?.project.set === 'color:#a1b2c3');
  await load();
  await page.waitForFunction(() => window.bookEngine.stageSet?.color === '#a1b2c3' && window.bookEngine.stageSet?.cloth?.color === '#123456');
  await page.getByRole('button', { name: 'Cerrar estudio', exact: true }).click();
  const result = await page.evaluate(async () => {
    const { bookEngine: engine, promoLab: lab } = window;
    engine.enterStudio();
    const { CLOTHS } = await import('/src/book/scenarios.ts');
    const presets = CLOTHS.filter((s) => s.tablecloth);
    const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 920;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#201e1c'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const shots = [];
    for (let i = 0; i < presets.length; i++) {
      const project = lab.projectFromTemplate('clasica'); project.cloth = presets[i].id; project.format = '16:9';
      const timeline = lab.compileProject(project, engine.currentBook); timeline.width = 960; timeline.height = 540;
      const times = [timeline.scenes[0], timeline.scenes[2]].map((s) => s.start + (s.end - s.start) * 0.65);
      const blobs = await lab.renderStills(engine, timeline, times);
      for (let j = 0; j < blobs.length; j++) {
        const image = await createImageBitmap(blobs[j]); ctx.drawImage(image, j * 480 + 8, i * 305 + 36, 464, 261); image.close();
        shots.push({ name: `${presets[i].id}-${j}.png`, bytes: [...new Uint8Array(await blobs[j].arrayBuffer())] });
      }
      ctx.fillStyle = '#ffffff'; ctx.font = '18px sans-serif'; ctx.fillText(presets[i].label, 12, i * 305 + 26);
    }
    // El filtro modifica bordes reales; usa los píxeles del destino de exportación.
    const aa = await engine.renderSession(640, 360, null, async (draw, source) => {
      const pass = engine.post.antialias;
      const copy = document.createElement('canvas'); copy.width = 640; copy.height = 360;
      const c = copy.getContext('2d');
      pass.enabled = false; draw(0); c.drawImage(source, 0, 0); const before = c.getImageData(0, 0, 640, 360).data;
      pass.enabled = true; draw(0); c.drawImage(source, 0, 0); const after = c.getImageData(0, 0, 640, 360).data;
      let changed = 0; for (let i = 0; i < before.length; i += 4) if (before[i] !== after[i] || before[i + 1] !== after[i + 1] || before[i + 2] !== after[i + 2]) changed++;
      return { changed, resolution: pass.uniforms.resolution.value.toArray() };
    });
    return { shots, aa, contact: canvas.toDataURL('image/png').split(',')[1] };
  });
  assert.ok(result.aa.changed > 100, `El filtro debe actuar sobre los bordes: ${result.aa.changed}`);
  assert.deepEqual(result.aa.resolution, [1 / 640, 1 / 360]);
  assert.equal(new Set(result.shots.map((s) => Buffer.from(s.bytes).toString('base64'))).size, 6);
  for (const shot of result.shots) writeFileSync(join(out, shot.name), Buffer.from(shot.bytes));
  writeFileSync(join(out, 'hoja-contacto.png'), Buffer.from(result.contact, 'base64'));
  assert.deepEqual(errors, []);
  console.log(`Manteles: selección, persistencia, retiro y seis fotos en verde. AA actúa sobre ${result.aa.changed} píxeles; resolución correcta. Muestra: out/manteles/hoja-contacto.png.`);
} finally { await browser.close(); }
