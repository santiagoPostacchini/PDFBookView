// Desde motion/: node scripts/ui-a11y-e2e.mjs <álbum.pdf> [URL]
// Verifica los tres tamaños, nombres accesibles, alcance y foco de teclado.
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
const [album, url = 'http://localhost:5173/'] = process.argv.slice(2);
assert.ok(album, 'Falta el álbum PDF');
const entry = readdirSync('node_modules/.remotion/chrome-headless-shell', { recursive: true, withFileTypes: true })
  .find((e) => e.isFile() && /^chrome-headless-shell(\.exe)?$/.test(e.name));
const browser = await chromium.launch({ executablePath: join(entry.parentPath ?? entry.path, entry.name), args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
try {
  for (const width of [390, 768, 1440]) {
    const height = width === 390 ? 844 : width === 768 ? 1024 : 900;
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(url);
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('pdf-book-view.mode', 'booklet'); });
    await page.reload();
    await page.setInputFiles('input[type=file]', album);
    await page.waitForSelector('.pager-label', { timeout: 120000 });
    if (await page.getByRole('button', { name: 'Cerrar editor', exact: true }).isVisible()) await page.getByRole('button', { name: 'Cerrar editor', exact: true }).click();
    const reachable = async (locator) => {
      await locator.scrollIntoViewIfNeeded();
      const box = await locator.boundingBox();
      if (await locator.isEnabled()) await locator.click({ trial: true });
      assert.ok(box && box.x >= -1 && box.y >= -1 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1, `Control alcanzable: ${await locator.ariaSnapshot()}`);
    };
    const audit = async () => {
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'Sin desborde del documento');
      for (const control of await page.locator('button:visible, input:visible, select:visible').all()) {
        const snapshot = await control.ariaSnapshot();
        assert.ok(/"[^"\n]+"/.test(snapshot), `Nombre accesible vacío: ${await control.evaluate((el) => el.outerHTML)}`);
      }
    };
    await reachable(page.getByRole('button', { name: 'Cargar PDF', exact: true }));
    await reachable(page.getByRole('button', { name: 'Estudio', exact: true }));
    await page.getByRole('button', { name: 'Hojas', exact: true }).click();
    await reachable(page.getByRole('button', { name: 'Cerrar editor', exact: true }));
    if (width <= 768) {
      const sheet = await page.locator('.sheet-editor').boundingBox();
      assert.ok(sheet.width === width && sheet.height === height, 'Hojas a pantalla completa');
    }
    await page.getByRole('button', { name: 'Cerrar editor', exact: true }).click();
    await page.getByRole('button', { name: 'Estudio', exact: true }).click();
    await audit();
    for (const control of await page.locator('.camera-controls button:visible').all()) await reachable(control);
    await reachable(page.getByRole('button', { name: 'Cerrar estudio', exact: true }));
    if (width <= 768) {
      const viewport = await page.locator('.viewport').boundingBox();
      assert.ok(viewport.height >= height * .35, 'Visor conserva al menos 35% del alto');
      await page.getByRole('button', { name: 'Colapsar estudio' }).click();
      await reachable(page.getByRole('button', { name: 'Cerrar estudio', exact: true }));
      await page.getByRole('button', { name: 'Expandir estudio' }).click();
    }
    await page.getByRole('tab', { name: 'Video promocional' }).click();
    for (let i = 0; i < 5; i++) {
      const step = page.locator('.video-steps button').nth(i);
      await reachable(step); await step.click(); await audit();
      if (i === 1) for (const name of ['Antes', 'Después']) await reachable(page.getByRole('button', { name, exact: true }));
      if (i === 4) await reachable(page.getByRole('button', { name: /^Exportar/ }).first());
    }
    await page.locator('.video-steps button').first().focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('.video-steps button').nth(1).getAttribute('aria-selected'), 'true');
    await page.locator('.storyboard .scene-card').nth(1).focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.storyboard .scene-card').nth(1).getAttribute('aria-current'), 'true');
    await page.getByRole('button', { name: 'Antes', exact: true }).click();
    assert.equal(await page.locator('.storyboard .scene-card').first().getAttribute('aria-current'), 'true', 'Reordenar con el control Antes');
    await page.locator('.storyboard .scene-card').first().focus();
    await page.keyboard.press('Space');
    assert.equal(await page.locator('.storyboard .scene-card').first().getAttribute('aria-current'), 'true');
    await page.locator('.video-steps button').first().click();
    await page.locator('.video-steps button').first().focus();
    const focused = new Set();
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab');
      const state = await page.evaluate(() => {
        const el = document.activeElement;
        const css = getComputedStyle(el);
        return { body: el === document.body, html: el.outerHTML, focus: css.outlineStyle !== 'none' && parseFloat(css.outlineWidth) > 0 || css.boxShadow !== 'none' };
      });
      if (state.body) continue;
      assert.ok(state.focus, `Sin foco visible: ${state.html}`); focused.add(state.html);
    }
    assert.ok(focused.size >= 15, 'Tab alcanza al menos 15 controles distintos');
    await page.getByRole('tab', { name: 'Foto', exact: true }).click(); await audit();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.studio-panel').count(), 0, 'Escape cierra Estudio');
    console.log(`Accesibilidad ${width}×${height}: OK`);
    await page.close();
  }
} finally { await browser.close(); }
