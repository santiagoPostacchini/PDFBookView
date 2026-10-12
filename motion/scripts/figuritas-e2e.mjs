// Uso desde motion/: node scripts/figuritas-e2e.mjs <álbum.pdf> <figuritas.pdf> <paquete.pdf> [URL]
// Datos del usuario y muestras sólo en out/ (ignorado); nunca se copian a public/.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
const [album, sheet, pack, url = 'http://127.0.0.1:5175/'] = process.argv.slice(2);
assert.ok(album && sheet && pack, 'Faltan álbum, hoja de figuritas y troquel');
const out = resolve('out/figuritas-e2e'); mkdirSync(out, { recursive: true });
const entry = readdirSync('node_modules/.remotion/chrome-headless-shell', { recursive: true, withFileTypes: true })
  .find((e) => e.isFile() && /^chrome-headless-shell(\.exe)?$/.test(e.name));
const browser = await chromium.launch({ executablePath: join(entry.parentPath ?? entry.path, entry.name),
  args: ['--use-angle=d3d11', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await page.route('**/__album-test', (route) => route.fulfill({ contentType: 'application/pdf', body: readFileSync(album) }));
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.evaluate(async () => { localStorage.clear(); await new Promise((r) => { const req = indexedDB.deleteDatabase('pdf-book-view.figuritas'); req.onsuccess = req.onerror = () => r(); }); });
  await page.reload();
  await page.setInputFiles('.topbar input[type=file]', album);
  await page.waitForSelector('.pager-label', { timeout: 120000 });
  if (await page.$('.sheet-editor')) await page.getByRole('button', { name: 'Cerrar editor', exact: true }).click();
  await page.getByRole('button', { name: 'Estudio', exact: true }).click();
  await page.getByRole('tab', { name: 'Video promocional' }).click();
  await page.locator('.template-card').filter({ has: page.locator('b', { hasText: /^Figuritas$/ }) }).click();
  await page.locator('.storyboard .scene-card').nth(3).click();
  assert.equal(await page.getByText('Todavía no cargaste figuritas', { exact: true }).isVisible(), true);
  assert.equal(await page.locator('.sticker-pack details').getAttribute('open'), null);
  await page.getByLabel('Cargar figuritas', { exact: true }).setInputFiles(sheet);
  await page.waitForFunction(() => document.querySelectorAll('.sticker-row').length >= 7, null, { timeout: 120000 });
  assert.equal(await page.locator('.sticker-row').count(), 7);
  assert.equal(await page.getByText('3 de 6 elegidas', { exact: true }).isVisible(), true);
  for (const number of [17, 19, 20]) await page.getByLabel(`Elegir figurita ${number}`, { exact: true }).check();
  assert.equal(await page.getByLabel('Elegir figurita 21', { exact: true }).isDisabled(), true);
  assert.equal(await page.getByText('6 de 6 elegidas', { exact: true }).isVisible(), true);
  const card20 = page.locator('.sticker-row').filter({ has: page.getByLabel('Elegir figurita 20', { exact: true }) });
  await card20.locator('summary').click();
  await page.getByLabel('Número de figurita 20', { exact: true }).fill('999');
  const edited = page.locator('.sticker-row').filter({ has: page.getByLabel('Elegir figurita 999', { exact: true }) });
  assert.equal(await edited.getByText('Sin casillero · elegí otro destino', { exact: false }).isVisible(), true);
  await page.getByLabel('Número de figurita 999', { exact: true }).fill('20');
  await page.getByLabel('Destino de figurita 20', { exact: true }).selectOption('page:2');
  assert.equal(await page.getByLabel('Destino de figurita 20', { exact: true }).inputValue(), 'page:2');
  await page.getByLabel('Destino de figurita 20', { exact: true }).selectOption('slot:20');
  await card20.locator('summary').click();
  await page.getByRole('button', { name: 'Elegir automáticamente hasta 3' }).click();
  await page.locator('.sticker-pack summary').click();
  await page.getByLabel('Diseño del paquete', { exact: true }).setInputFiles(pack);
  await page.locator('p[role="status"]').waitFor({ state: 'hidden' });
  await page.getByText('Tu diseño', { exact: true }).waitFor();
  await page.locator('.sticker-pack summary').click();
  const loaded = await page.evaluate(async (name) => {
    const { loadLibrary } = await import('/src/promo/figuritas/library.ts');
    const library = await loadLibrary(name);
    return library.stickers.map(({ number, widthPt, heightPt }) => ({ number, widthPt, heightPt }));
  }, basename(album));
  console.log('Figuritas:', loaded);
  assert.deepEqual(loaded.map((s) => s.number).sort((a, b) => a - b), [13, 14, 16, 17, 19, 20, 21]);
  for (const s of loaded) assert.ok([19, 20, 21].includes(s.number) ? s.widthPt > s.heightPt : s.heightPt > s.widthPt);
  assert.equal(await page.locator('.topbar').isVisible(), false);
  await page.waitForFunction(() => window.bookEngine.frameMargins.top === 24);
  await page.getByRole('button', { name: 'Mostrar barra superior' }).click();
  await page.waitForFunction(() => window.bookEngine.frameMargins.top === 108);
  await page.getByRole('button', { name: 'Ocultar barra superior' }).click();
  assert.equal(await page.locator('.topbar').isVisible(), false);
  await page.waitForFunction(() => window.bookEngine.frameMargins.top === 24);
  await page.getByRole('button', { name: 'Mostrar barra superior' }).click();
  await page.screenshot({ path: join(out, 'interfaz.png') });
  // Persistencia y números: volver a abrir el documento recupera las 7 figuritas.
  await page.getByRole('button', { name: 'Ocultar barra superior' }).click();
  await page.waitForFunction(() => localStorage.getItem('pdf-book-view.video-topbar-hidden') === 'true');
  await page.reload();
  assert.equal(await page.locator('.topbar').isVisible(), true);
  await page.setInputFiles('.topbar input[type=file]', album);
  await page.waitForSelector('.pager-label', { timeout: 120000 });
  if (await page.$('.sheet-editor')) await page.getByRole('button', { name: 'Cerrar editor', exact: true }).click();
  await page.getByRole('button', { name: 'Estudio', exact: true }).click();
  await page.getByRole('tab', { name: 'Video promocional' }).click();
  await page.locator('.storyboard .scene-card').nth(3).click();
  await page.waitForFunction(() => document.querySelectorAll('.sticker-row').length === 7);
  await page.getByRole('button', { name: 'Cerrar estudio', exact: true }).click();
  // Render de cada fase y búsqueda hacia atrás usando el mismo reproductor que el editor.
  const result = await page.evaluate(async (name) => {
    const { loadLibrary } = await import('/src/promo/figuritas/library.ts');
    const { libraryImages } = await import('/src/promo/figuritas/assets.ts');
    const { PdfSource } = await import('/src/pdf/pdfSource.ts');
    const { bookletLayout } = await import('/src/pdf/layouts.ts');
    const { autoPlan } = await import('/src/pdf/imposition.ts');
    const { findNumberedSlots } = await import('/src/pdf/slots.ts');
    const { compileProject } = await import('/src/promo/compile.ts');
    const { projectFromTemplate } = await import('/src/promo/templates.ts');
    const { VideoPreview } = await import('/src/promo/preview.ts');
    const { renderStills } = await import('/src/promo/record.ts');
    const { evaluateShow } = await import('/src/promo/figuritas/choreography.ts');
    const { restingPacks } = await import('/src/promo/figuritas/choreography.ts');
    const { blobToBase64 } = await import('/src/promo/lab.ts');
    // Relee sólo el archivo que ya se seleccionó con la interfaz.
    // React vacía el input después de abrir; el PDF se obtiene del archivo suministrado por el script.
    const data = await (await fetch('/__album-test')).arrayBuffer();
    const pdf = await PdfSource.open(data, name);
    try {
      const library = await loadLibrary(name), images = await libraryImages(library);
      const slots = await findNumberedSlots(pdf, bookletLayout(autoPlan(pdf.pageCount), pdf.pageCount));
      const size = await pdf.pageSize(0);
      const engine = window.bookEngine, book = engine.currentBook;
      engine.enterStudio();
      const shape = { leafCount: book.leafCount, pageWidth: book.pageWidth, pageHeight: book.pageHeight, pagePt: { width: size.width / 2, height: size.height }, slots };
      console.log('Sitios', library.stickers.map((s) => [s.number, slots.get(s.number)]));
      const samples = {}, curves = {}, destinations = [];
      for (const format of ['9:16', '16:9']) {
        const project = projectFromTemplate('figuritas', { format, set: 'mantel-rosa' });
        // Seis figuritas en una escena y la séptima en otra, para comprobar las siete.
        project.scenes[3].stickers = library.stickers.slice(0, 6).map((s) => ({ id: s.id }));
        project.scenes.splice(4, 0, { kind: 'figuritas', stickers: library.stickers.slice(6).map((s) => ({ id: s.id })) });
        const timeline = compileProject(project, shape, library);
        const show = timeline.shows[0], flight = show.flights[0];
        const preview = new VideoPreview(engine, images);
        preview.setTimeline(timeline, flight.stick + 0.05);
        const pasted = engine.textures.decorations.size;
        const bendFlight = show.flights.find((f) => f.target.sticker.widthPt > f.target.sticker.heightPt) ?? flight;
        const bendTime = bendFlight.lower + (bendFlight.stick - bendFlight.lower) * 0.3;
        preview.seek(bendTime);
        const bending = preview.player.rigs.rigs[0].stickers[show.flights.indexOf(bendFlight)];
        if (!bending.visible || !bending.geometry.attributes.position.array.some((v, i) => i % 3 === 2 && v > bending.userData.flat[i] + 0.01)) throw new Error('La figurita no se curva al apoyar');
        if (engine.stage.set.tabletop.geometry.index.count !== 30) throw new Error('La madera todavía dibuja una segunda cara superior');
        const lastShow = timeline.shows.at(-1);
        preview.seek(Math.min(timeline.duration, lastShow.end + 0.2));
        const resting = preview.player.rigs.rigs.at(-1).pack;
        if (!resting.visible || resting.position.distanceTo(restingPacks(lastShow)[2].position) > 1e-6) throw new Error('El sobre no queda acostado en el mazo');
        if (!preview.player.rigs.rigs.at(-1).companions.every((p) => p.visible)) throw new Error('Faltan los dos sobres del mazo');
        if (preview.player.rigs.rigs.slice(0, -1).some((r) => r.pack.visible)) throw new Error('Hay sobres superpuestos');
        preview.seek(Math.max(0, show.start - 0.1));
        if (show.start > 0 && preview.player.rigs.rigs[0].pack.visible) throw new Error('El sobre aparece antes de su entrada');
        preview.seek(show.start);
        if (engine.textures.decorations.size !== 0 || !pasted) throw new Error('Buscar atrás no despega');
        preview.dispose();
        for (const s of timeline.shows) for (const f of s.flights) {
          const pose = evaluateShow(s, s.end, (p) => book.pageCenter(p)).stickers[s.flights.indexOf(f)];
          const center = book.pageCenter(f.target.page);
          const u = (pose.position.x - center.x) / book.pageWidth + 0.5;
          const v = (pose.position.z - center.z) / book.pageHeight + 0.5;
          if (Math.abs(u - f.target.u) > 0.01 || Math.abs(v - f.target.v) > 0.01) throw new Error('Destino fuera del casillero');
          destinations.push({ number: f.target.sticker.number, page: f.target.page, u, v });
        }
        const times = [show.opened, (flight.fly + flight.lower) / 2, show.end - 1 / 30];
        const rendered = await Promise.all((await renderStills(engine, timeline, [...times, bendTime], { images })).map(blobToBase64));
        samples[format] = rendered.slice(0, 3); curves[format] = rendered[3];
      }
      return { samples, curves, destinations };
    } finally { await pdf.destroy(); }
  }, basename(album));
  for (const [format, images] of Object.entries(result.samples)) images.forEach((image, i) => writeFileSync(join(out, `${format.replace(':', 'x')}-${i}.png`), Buffer.from(image, 'base64')));
  for (const [format, image] of Object.entries(result.curves)) writeFileSync(join(out, `${format.replace(':', 'x')}-curvatura.png`), Buffer.from(image, 'base64'));
  const contact = await page.evaluate(async (samples) => {
    const canvas = document.createElement('canvas'); canvas.width = 1260; canvas.height = 1000;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#201e1c'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const [row, [format, images]] of Object.entries(samples).entries()) {
      for (let col = 0; col < images.length; col++) {
        const image = new Image(); image.src = 'data:image/png;base64,' + images[col]; await image.decode();
        const scale = Math.min(400 / image.width, 440 / image.height);
        const w = image.width * scale, h = image.height * scale;
        ctx.drawImage(image, col * 420 + (420 - w) / 2, row * 500 + 42 + (440 - h) / 2, w, h);
        ctx.fillStyle = '#ffffff'; ctx.font = '18px sans-serif'; ctx.fillText(`${format} · ${['Paquete abierto', 'En vuelo', 'Pegadas'][col]}`, col * 420 + 15, row * 500 + 28);
      }
    }
    return canvas.toDataURL('image/png').split(',')[1];
  }, result.samples);
  writeFileSync(join(out, 'hoja-contacto.png'), Buffer.from(contact, 'base64'));
  console.log('Destinos verificados:', result.destinations);
  assert.equal(result.destinations.length, 14);
  await page.getByRole('button', { name: 'Estudio', exact: true }).click();
  await page.getByRole('tab', { name: 'Video promocional' }).click();
  await page.getByRole('button', { name: 'Ambiente', exact: false }).first().click();
  await page.getByRole('button', { name: 'Automático · color de la tapa' }).click();
  await page.waitForFunction(() => window.bookEngine.stageSet?.color && !window.bookEngine.stageSet.id);
  const autoColor = await page.evaluate(() => window.bookEngine.stageSet.color);
  assert.notEqual(autoColor, '#dcc6a8');
  await page.getByRole('button', { name: 'Exportar', exact: false }).first().click();
  await page.locator('.format-option').filter({ has: page.locator('b', { hasText: /^16:9$/ }) }).click();
  const downloads = [];
  page.on('download', (download) => downloads.push(download));
  await page.getByRole('button', { name: 'Exportar 2 videos', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.video-result .video-file').length === 2 && !document.querySelector('.record-progress'), null, { timeout: 600000, polling: 1000 });
  assert.equal(downloads.length, 2);
  for (const download of downloads) {
    await download.saveAs(join(out, download.suggestedFilename()));
    console.log('MP4:', download.suggestedFilename());
  }
  assert.deepEqual(errors, []);
  console.log('F-3 a F-6 y T-007: controles, recursos, destinos, persistencia, búsqueda, color y exportación en verde.');
} finally { await browser.close(); }
