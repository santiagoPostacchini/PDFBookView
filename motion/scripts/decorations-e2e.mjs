// F-1: pegado y retiro reales en WebGL con páginas sintéticas, sin datos de clientes.
// Desde motion/: node scripts/decorations-e2e.mjs [URL del visor]
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const entry = readdirSync('node_modules/.remotion/chrome-headless-shell', { recursive: true, withFileTypes: true })
  .find((e) => e.isFile() && /^chrome-headless-shell(\.exe)?$/.test(e.name));
assert.ok(entry, 'Falta Chrome headless de Remotion');
const browser = await chromium.launch({
  executablePath: join(entry.parentPath ?? entry.path, entry.name),
  args: ['--use-angle=d3d11', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(process.argv[2] ?? 'http://127.0.0.1:5173/');
  await page.waitForFunction(() => !!window.bookEngine);
  const result = await page.evaluate(async () => {
    const engine = window.bookEngine;
    const image = document.createElement('canvas');
    image.width = 256;
    image.height = 360;
    image.getContext('2d').fillStyle = '#ffffff';
    image.getContext('2d').fillRect(0, 0, 256, 360);
    engine.setBook({ pageCount: 6, pageAspect: 256 / 360, load: async () => image }, { initialSpread: 1 });
    await engine.preloadPages([1, 2]);
    const thumb = engine.getThumbnail(2);
    const redPixels = async () => {
      const blob = await engine.capturePhoto({ longSide: 600, type: 'image/png' });
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] > 100 && pixels[i] > pixels[i + 1] * 2 && pixels[i] > pixels[i + 2] * 2) count++;
      }
      return count;
    };
    const before = await redPixels();
    engine.setPageDecorations(2, [(ctx, w, h) => {
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(w * 0.2, h * 0.2, w * 0.6, h * 0.6);
    }]);
    const pasted = await redPixels();
    const originalThumbnail = engine.getThumbnail(2) === thumb && thumb === image;
    engine.setPageDecorations(2, null);
    const removed = await redPixels();
    engine.setPageDecorations(2, [(ctx, w, h) => {
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, w, h);
    }]);
    engine.clearPageDecorations();
    const cleared = await redPixels();
    return { before, pasted, removed, cleared, originalThumbnail };
  });
  assert.ok(result.pasted > result.before + 1000, 'El pegado tiene que verse en el render');
  assert.ok(result.removed < result.before + 100, 'Quitar restaura la página');
  assert.ok(result.cleared < result.before + 100, 'Limpiar restaura todas las páginas');
  assert.ok(result.originalThumbnail, 'La miniatura sigue siendo la original');
  assert.deepEqual(errors, []);
  console.log('F-1 en verde:', result);
} finally {
  await browser.close();
}
