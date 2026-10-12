// Capturas del Estudio para revisar la interfaz (antes/después de un cambio).
// Con npm run dev en la raíz, desde motion/:
//   node scripts/ui-shots.mjs <álbum.pdf> <carpeta-salida> [--mobile] [--url http://localhost:5173/]
// Saca el visor, la pestaña Foto y cada paso del editor de video (normal y panel completo).
import assert from 'node:assert/strict';
import { mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, args[i + 1]?.startsWith('--') || i + 1 >= args.length ? 1 : 2)[1] ?? true : null;
};
const mobile = !!flag('mobile');
const url = flag('url') || 'http://localhost:5173/';
const [album, outArg] = args;
assert.ok(album && outArg, 'Uso: ui-shots.mjs <álbum.pdf> <carpeta-salida> [--mobile] [--url …]');
const out = resolve(outArg);
mkdirSync(out, { recursive: true });
const entry = readdirSync('node_modules/.remotion/chrome-headless-shell', { recursive: true, withFileTypes: true })
  .find((e) => e.isFile() && /^chrome-headless-shell(\.exe)?$/.test(e.name));
assert.ok(entry, 'Falta el Chrome headless de Remotion.');
const browser = await chromium.launch({ executablePath: join(entry.parentPath ?? entry.path, entry.name), args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const sizes = mobile
  ? [['m', { width: 390, height: 844 }], ['mt', { width: 390, height: 2600 }]]
  : [['n', { width: 1440, height: 900 }], ['t', { width: 1440, height: 2600 }]];
try {
  for (const [tag, viewport] of sizes) {
    const page = await browser.newPage({ viewport });
    const shot = async (name) => {
      await page.waitForTimeout(600);
      await page.screenshot({ path: join(out, `${tag}-${name}.png`) });
    };
    await page.goto(url);
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('pdf-book-view.mode', 'booklet');
    });
    await page.reload();
    await page.setInputFiles('input[type=file]', album);
    await page.waitForSelector('.pager-label', { timeout: 60_000 });
    await page.waitForTimeout(1500);
    await shot('0-visor');
    await page.getByRole('button', { name: 'Estudio', exact: true }).click();
    await page.waitForSelector('.studio-panel');
    await shot('1-foto');
    await page.getByText('Video promocional').first().click();
    await page.waitForSelector('.video-steps');
    const steps = await page.locator('.video-steps button').allInnerTexts();
    for (const [i, label] of steps.entries()) {
      await page.locator('.video-steps button').nth(i).click();
      await shot(`2-${i + 1}-${label.replace(/^\d\s*/, '').replace(/\W+/g, '')}`);
    }
    await page.close();
  }
} finally {
  await browser.close();
}
console.log('capturas en', out);
