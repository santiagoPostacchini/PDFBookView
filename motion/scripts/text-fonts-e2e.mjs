// Fuente propia, persistencia, canvas compartido y MP4 real; usa el álbum genérico.
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
const entry = readdirSync('node_modules/.remotion/chrome-headless-shell', { recursive: true, withFileTypes: true }).find(e => e.isFile() && /^chrome-headless-shell(\.exe)?$/.test(e.name));
const browser = await chromium.launch({ executablePath: join(entry.parentPath ?? entry.path, entry.name), args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.argv[2] ?? 'http://127.0.0.1:5173/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('pdf-book-view.mode', 'simple'); });
  await page.reload();
  await page.setInputFiles('.topbar input[type=file]', 'out/demo/album-demo.pdf');
  await page.waitForFunction(() => window.promoLab && window.bookEngine?.currentBook);
  const result = await page.evaluate(async () => {
    const fonts = await import('/src/promo/fonts.ts');
    const overlay = await import('/src/promo/overlay.ts');
    const { VideoPreview } = await import('/src/promo/preview.ts');
    const blob = await (await fetch('/fonts/caveat-normal-600.woff2')).blob();
    const font = await fonts.addFont(new File([blob], 'Prueba propia.woff2', { type: 'font/woff2' }));
    const project = window.promoLab.projectFromTemplate('minimal', { duration: 2, scenes: [{ kind: 'portada' }], textItems: [{ id: 'prueba', text: 'Fuente propia\nSegunda línea', start: 0, duration: 2, x: 0.5, y: 0.3, size: 0.05, color: 'auto', font: font.id, animation: 'ninguna' }] });
    const timeline = window.promoLab.compileProject(project, window.bookEngine.currentBook);
    timeline.width = 360; timeline.height = 640;
    const preview = new VideoPreview(window.bookEngine);
    preview.setTimeline(timeline);
    await overlay.loadTextFonts(timeline);
    const previewFonts = [];
    const previewCtx = window.bookEngine.overlay.canvas.getContext('2d');
    const previewFill = previewCtx.fillText.bind(previewCtx);
    previewCtx.fillText = (text, ...args) => { previewFonts.push(previewCtx.font); previewFill(text, ...args); };
    preview.seek(0);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    previewCtx.fillText = previewFill;
    const canvas = document.createElement('canvas'); canvas.width = 360; canvas.height = 640;
    const ctx = canvas.getContext('2d'), calls = [];
    const original = ctx.fillText.bind(ctx);
    ctx.fillText = (text, ...args) => { calls.push(ctx.font); original(text, ...args); };
    overlay.drawOverlay(ctx, timeline, 0, overlay.overlayTheme('#ffffff'));
    const loaded = await fonts.ensureFont(font.id);
    const persisted = (await fonts.listFonts()).some(f => f.id === font.id);
    const originalFill = CanvasRenderingContext2D.prototype.fillText;
    const exportFonts = [];
    CanvasRenderingContext2D.prototype.fillText = function(text, ...args) { exportFonts.push(this.font); return originalFill.call(this, text, ...args); };
    let mp4;
    try { mp4 = await window.promoLab.recordTimeline(window.bookEngine, timeline, { fps: 10 }); }
    finally { CanvasRenderingContext2D.prototype.fillText = originalFill; }
    await fonts.removeFont(font.id);
    await overlay.loadTextFonts(timeline);
    calls.length = 0;
    overlay.drawOverlay(ctx, timeline, 0, overlay.overlayTheme('#ffffff'));
    const missing = await fonts.ensureFont(font.id);
    const fallback = [...calls];
    const fallbackMp4 = await window.promoLab.recordTimeline(window.bookEngine, timeline, { fps: 10 });
    preview.dispose();
    return { family: font.family, loaded, persisted, missing, fallback, previewFonts, exportFonts, bytes: mp4.size, fallbackBytes: fallbackMp4.size };
  });
  assert.ok(result.loaded && result.persisted);
  assert.ok(result.exportFonts.some(css => css.includes(result.family)));
  assert.ok(result.previewFonts.some(css => css.includes(result.family)));
  assert.equal(result.missing, false);
  assert.ok(result.fallback.every(css => css.includes('Fraunces')));
  assert.ok(result.bytes > 1000 && result.fallbackBytes > 1000);
  assert.deepEqual(errors, []);
  console.log('Fuentes propias y fallback en canvas/MP4: OK', { bytes: result.bytes, fallbackBytes: result.fallbackBytes });
} finally { await browser.close(); }
