// Muestra del orquestador de videos: carga un álbum en la app (Chrome headless),
// arma un proyecto desde una plantilla y genera cuadros sueltos, una hoja de
// contacto del guion y (opcional) el MP4 final. Sin pasar por la interfaz.
//
//   node scripts/promo-sample.mjs <pdf> [--template clasica] [--format 9:16] [--duration 15]
//        [--set arena] [--lighting suave] [--handle @tu.marca] [--mode simple|booklet]
//        [--typography clasica|moderna|manuscrita] [--block fonts.googleapis.com]
//        [--out out/muestra] [--video] [--frames 0.5,3,6]
//
// Requiere la app corriendo (npm run dev en la raíz, http://localhost:5173).
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const pdf = resolve(args[0] ?? '');
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);
const out = resolve(flag('out', 'out/muestra'));
mkdirSync(out, { recursive: true });

const t0 = Date.now();
const log = (...m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...m);

const browser = await chromium.launch({
  executablePath: findExe('node_modules/.remotion/chrome-headless-shell'),
  args: ['--use-angle=d3d11', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
page.on('pageerror', (err) => console.error('[pageerror]', err.message));
page.on('console', (msg) => msg.type() === 'error' && console.error('[console]', msg.text()));
// --block <host> corta los pedidos a ese host (p. ej. para comprobar que nada depende de Google Fonts).
if (flag('block')) {
  await page.route(`**://${flag('block')}/**`, (route) => {
    console.warn('[bloqueado]', route.request().url());
    return route.abort();
  });
}

await page.goto(flag('url', 'http://localhost:5173/'));
await page.evaluate((mode) => localStorage.setItem('pdf-book-view.mode', mode), flag('mode', 'simple'));
await page.reload();
await page.setInputFiles('input[type=file]', pdf);
await page.waitForSelector('.pager-label', { timeout: 60_000 });
await page.waitForFunction(() => window.promoLab && window.bookEngine?.currentBook, null, { timeout: 30_000 });
if (await page.$('.sheet-editor')) await page.click('.sheet-editor button[aria-label="Cerrar editor"]');
log('libro cargado:', await page.textContent('.pager-label'));

const options = {
  template: flag('template', 'clasica'),
  format: flag('format', '9:16'),
  duration: flag('duration') ? Number(flag('duration')) : undefined,
  set: flag('set'),
  lighting: flag('lighting'),
  handle: flag('handle'),
  typography: flag('typography'),
  frames: flag('frames'),
};

// Guion compilado + cuadros: uno en el medio de cada escena (o los pedidos).
const result = await page.evaluate(async (o) => {
  const { promoLab: lab, bookEngine: engine } = window;
  engine.enterStudio();
  const project = lab.projectFromTemplate(o.template, { format: o.format });
  if (o.duration) project.duration = o.duration;
  if (o.set) project.set = o.set;
  if (o.lighting) project.lighting = o.lighting;
  if (o.handle) project.textItems.find(t => t.id === 'handle').text = o.handle;
  if (o.typography) project.textItems = project.textItems.map(t => ({ ...t, font: `builtin:${o.typography}` }));
  const book = engine.currentBook;
  const timeline = lab.compileProject(project, book);
  const times = o.frames ? o.frames.split(',').map(Number) : timeline.scenes.map((s) => (s.start + s.end) / 2);
  const stills = await lab.renderStills(engine, timeline, times);
  return {
    project,
    times,
    scenes: timeline.scenes.map((s) => ({ label: s.label, start: +s.start.toFixed(2), end: +s.end.toFixed(2), spread: s.spread })),
    actions: timeline.actions.map((a) => ({ at: +a.at.toFixed(2), spread: a.spread })),
    duration: timeline.duration,
    stills: await Promise.all(stills.map((b) => lab.blobToBase64(b))),
  };
}, options);

writeFileSync(join(out, 'guion.json'), JSON.stringify({ ...result, stills: undefined }, null, 2));
const files = result.stills.map((b64, i) => {
  const file = join(out, `cuadro-${String(i + 1).padStart(2, '0')}.png`);
  writeFileSync(file, Buffer.from(b64, 'base64'));
  return file;
});
log(`${files.length} cuadros (${result.duration.toFixed(1)} s de guion):`, result.scenes.map((s) => s.label).join(' → '));

// Hoja de contacto: los cuadros en fila con el nombre de la escena y el tiempo.
const sheet = await browser.newPage({ viewport: { width: 1800, height: 900 }, deviceScaleFactor: 1 });
const cells = result.stills
  .map((b64, i) => {
    const scene = result.scenes.find((s) => result.times[i] >= s.start && result.times[i] <= s.end) ?? result.scenes[i];
    return `<figure><img src="data:image/png;base64,${b64}"><figcaption><b>${i + 1}. ${scene?.label ?? ''}</b><span>${result.times[i].toFixed(1)} s</span></figcaption></figure>`;
  })
  .join('');
await sheet.setContent(`<!doctype html><meta charset="utf-8"><style>
  body { margin: 0; padding: 28px; background: #1d1b19; font: 15px 'Segoe UI', sans-serif; color: #eee; }
  h1 { font-weight: 600; font-size: 20px; margin: 0 0 18px; } h1 span { color: #a9a39b; font-weight: 400; }
  .row { display: flex; gap: 14px; } figure { margin: 0; flex: 1; min-width: 0; }
  img { width: 100%; display: block; border-radius: 6px; } figcaption { display: flex; justify-content: space-between; margin-top: 8px; }
  figcaption span { color: #a9a39b; }
</style><h1>Plantilla «${result.project.template}» · ${result.project.format} · ${result.duration.toFixed(0)} s <span>— un cuadro por escena</span></h1><div class="row">${cells}</div>`);
await sheet.waitForTimeout(300);
const height = await sheet.evaluate(() => document.body.scrollHeight);
await sheet.setViewportSize({ width: 1800, height });
await sheet.screenshot({ path: join(out, 'hoja-de-contacto.png') });
log('hoja de contacto: hoja-de-contacto.png');

if (has('video')) {
  const b64 = await page.evaluate(async (o) => {
    const { promoLab: lab, bookEngine: engine } = window;
    const project = lab.projectFromTemplate(o.template, { format: o.format });
    if (o.duration) project.duration = o.duration;
    if (o.set) project.set = o.set;
    if (o.lighting) project.lighting = o.lighting;
    if (o.handle) project.textItems.find(t => t.id === 'handle').text = o.handle;
    if (o.typography) project.textItems = project.textItems.map(t => ({ ...t, font: `builtin:${o.typography}` }));
    const timeline = lab.compileProject(project, engine.currentBook);
    let last = 0;
    const blob = await lab.recordTimeline(engine, timeline, {
      onProgress: (phase, done, total) => {
        if (phase === 'grabando' && done - last >= 60) {
          last = done;
          console.info(`grabando ${done}/${total}`);
        }
      },
    });
    return lab.blobToBase64(blob);
  }, options);
  const file = join(out, `muestra-${options.template}-${options.format.replace(':', 'x')}.mp4`);
  writeFileSync(file, Buffer.from(b64, 'base64'));
  log('video:', file);
}

await browser.close();

function findExe(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && /^chrome-headless-shell(\.exe)?$/.test(entry.name)) return join(entry.parentPath ?? entry.path, entry.name);
  }
  throw new Error('No se encontró chrome-headless-shell (corré un render de Remotion una vez para descargarlo).');
}
