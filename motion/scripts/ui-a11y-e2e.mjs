// Desde motion/: node scripts/ui-a11y-e2e.mjs <álbum.pdf> [URL] [--figuritas <hoja.pdf>] [--paquete <troquel.pdf>]
// Verifica los tres tamaños, nombres accesibles, alcance y foco de teclado.
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(`--${name}`);
  if (index < 0) return null;
  const value = args[index + 1];
  assert.ok(value && !value.startsWith('--'), `--${name} requiere un PDF`);
  args.splice(index, 2); return value;
};
const figuritas = option('figuritas');
const paquete = option('paquete');
const [album, url = 'http://localhost:5173/'] = args;
assert.ok(album, 'Falta el álbum PDF');
const entry = readdirSync('node_modules/.remotion/chrome-headless-shell', { recursive: true, withFileTypes: true })
  .find((e) => e.isFile() && /^chrome-headless-shell(\.exe)?$/.test(e.name));
const browser = await chromium.launch({ executablePath: join(entry.parentPath ?? entry.path, entry.name), args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
try {
  for (const width of [390, 768, 1440]) {
    const height = width === 390 ? 844 : width === 768 ? 1024 : 900;
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(url);
    assert.equal(await page.getByRole('button', { name: /^(Acercar|Alejar)$/ }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Vista inicial', exact: true }).count(), 1);
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
      const handle = page.locator('.sheet-handle');
      assert.equal(await handle.getAttribute('aria-expanded'), 'false');
      const initial = await page.locator('.studio-panel').boundingBox();
      assert.ok(Math.abs(initial.height - height * .60) < 2, 'Hoja inicial de 60%');
      await handle.focus(); await page.keyboard.press('Enter');
      assert.equal(await handle.getAttribute('aria-expanded'), 'true');
      assert.ok(Math.abs((await page.locator('.studio-panel').boundingBox()).height - height * .88) < 2, 'Hoja expandida de 88%');
      await reachable(page.getByRole('button', { name: 'Cerrar estudio', exact: true }));
      await handle.focus(); await page.keyboard.press('Space');
      assert.equal(await handle.getAttribute('aria-expanded'), 'false');
    }
    await page.getByRole('tab', { name: 'Video promocional' }).click();
    for (let i = 0; i < 5; i++) {
      const step = page.locator('.video-steps button').nth(i);
      await reachable(step); await step.click(); await audit();
      if (i === 1) for (const name of ['Antes', 'Después']) await reachable(page.getByRole('button', { name, exact: true }));
      if (i === 2) {
        await reachable(page.getByLabel('Texto', { exact: true }));
        await reachable(page.getByLabel('Inicio', { exact: true }));
        await reachable(page.getByLabel('Duraci\u00f3n', { exact: true }));
        assert.equal(await page.locator('.text-item-row').count(), 4);
      }
      if (i === 3) {
        await reachable(page.getByRole('button', { name: 'Fondo Arena', exact: true }));
        const table = page.getByLabel('Usar mesa', { exact: true });
        await reachable(table); await table.uncheck();
        assert.equal(await page.getByRole('button', { name: 'Mantel Lino', exact: true }).count(), 0);
        await table.check();
        await reachable(page.getByRole('button', { name: 'Mantel Lino', exact: true }));
        await reachable(page.getByLabel('Color de fondo a elección', { exact: true }));
        await reachable(page.getByLabel('Color de mantel a elección', { exact: true }));
      }
      if (i === 4) await reachable(page.getByRole('button', { name: /^Exportar/ }).first());
    }
    // Geometría del selector y del guion, incluso con las tarjetas desplazadas.
    const selector = page.locator('.studio-tabs');
    const bounds = await selector.boundingBox();
    const tabs = await selector.locator('button').all();
    const boxes = await Promise.all(tabs.map((tab) => tab.boundingBox()));
    assert.ok(boxes.every((box) => box.x >= bounds.x && box.x + box.width <= bounds.x + bounds.width + 1), 'Foto/Video dentro del selector');
    if (width <= 768) {
      assert.ok(Math.abs(boxes[0].width - boxes[1].width) < 1, 'Dos mitades iguales');
      const preview = await page.locator('.viewport').boundingBox();
      const frame = await page.locator('.viewport canvas').first().boundingBox();
      assert.ok(frame.y >= preview.y && frame.y + frame.height <= preview.y + preview.height + 1 && frame.height >= preview.height - 9, 'Video aprovecha el alto libre');
      const playBox = await page.locator('.storyboard-play').boundingBox();
      for (const card of await page.locator('.storyboard .scene-card').all()) {
        await card.scrollIntoViewIfNeeded();
        const box = await card.boundingBox();
        assert.ok(box.x >= playBox.x + playBox.width, 'Reproducir no se superpone con tarjetas');
        const thumbBox = await card.locator('.scene-thumb').boundingBox();
        const labelBox = await card.locator('.scene-card-label').boundingBox();
        assert.ok(thumbBox.y + thumbBox.height <= labelBox.y + 1, 'Miniatura separada del nombre');
        assert.ok(await card.locator('b').evaluate((el) => el.scrollWidth <= el.clientWidth), 'Nombre completo de escena');
      }
    }
    await page.locator('.video-steps button').first().click();
    await page.locator('.template-card').filter({ has: page.locator('b', { hasText: /^Figuritas$/ }) }).click();
    await page.locator('.storyboard .scene-card').nth(3).click();
    if (figuritas) {
      await page.getByLabel('Cargar figuritas', { exact: true }).setInputFiles(figuritas);
      await page.locator('.sticker-row').first().waitFor({ timeout: 120000 });
    }
    if (paquete) {
      await page.locator('.sticker-pack summary').click();
      await page.getByLabel('Dise\u00f1o del paquete', { exact: true }).setInputFiles(paquete);
      await page.getByText('Tu dise\u00f1o', { exact: true }).waitFor({ timeout: 120000 });
      await page.locator('.sticker-pack summary').click();
    }
    if (width <= 768) {
      const scroll = page.locator('.scene-editor');
      const area = await scroll.boundingBox();
      const track = await page.locator('.studio-dock').boundingBox();
      console.log(`Hoja ${width}: ${area.height}px de contenido desplazable`);
      assert.ok(area.height >= 220, `Contenido útil >= 220 px: ${area.height}`);
      assert.ok(area.y + area.height <= track.y + 1 && track.height <= 96, 'Guion reservado sin superposición');
      if (figuritas) {
        for (const toggle of await page.getByRole('checkbox', { name: /^Elegir figurita / }).all()) {
          await scroll.evaluate((el) => { el.scrollTop = 0; });
          await toggle.evaluate((el) => el.scrollIntoView({ block: 'center' }));
          await reachable(toggle);
          const box = await toggle.boundingBox();
          assert.ok(box.y >= area.y && box.y + box.height <= area.y + area.height, 'Figurita dentro del área desplazable');
        }
        assert.ok(await scroll.evaluate((el) => el.scrollTop > 0), 'Figuritas alcanzadas desplazando la hoja');
      }
    }
    // Restaurar el guion inicial para conservar las pruebas de reordenamiento.
    await page.locator('.video-steps button').first().click();
    await page.locator('.template-card').first().click();
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
