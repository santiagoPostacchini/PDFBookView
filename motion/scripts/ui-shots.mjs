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
      const notice = await page.locator('.notices').isVisible() ? await page.locator('.notices').boundingBox() : null;
      if (notice && !mobile) {
        const controls = await page.locator('.topbar:visible, .show-topbar:visible, .camera-controls:visible, .bottombar:visible').all();
        for (const control of controls) {
          const box = await control.boundingBox();
          assert.ok(!box || notice.x + notice.width <= box.x || box.x + box.width <= notice.x ||
            notice.y + notice.height <= box.y || box.y + box.height <= notice.y, 'Avisos separados de los controles');
        }
      }
      if (!mobile && await page.locator('.app.is-video').count()) {
        const frame = await page.locator('.viewport canvas').first().boundingBox();
        const bar = await page.locator('.topbar').isVisible()
          ? await page.locator('.topbar').boundingBox() : await page.locator('.show-topbar').boundingBox();
        assert.ok(frame && bar && (bar.y + bar.height <= frame.y || bar.x + bar.width <= frame.x), 'Barra fuera del cuadro del video');
      }
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
    if (await page.getByRole('button', { name: 'Cerrar editor', exact: true }).isVisible()) {
      await page.getByRole('button', { name: 'Cerrar editor', exact: true }).click();
    }
    await shot('0-visor');
    await page.getByRole('button', { name: 'Estudio', exact: true }).click();
    await page.waitForSelector('.studio-panel');
    assert.equal(await page.locator('.topbar').isVisible(), true);
    if (!mobile) {
      const boxes = await page.locator('.topbar-group').evaluateAll((groups) => groups.map((group) => {
        const r = group.getBoundingClientRect(); return { top: r.top, right: r.right };
      }));
      assert.ok(boxes.every((b) => Math.abs(b.top - boxes[0].top) < 2), 'Tres grupos en una fila');
      const bar = await page.locator('.topbar').boundingBox();
      assert.ok(boxes.every((b) => b.right <= bar.x + bar.width), 'Grupos dentro de la barra');
      assert.ok((await page.getByRole('button', { name: 'Ocultar barra superior' }).innerText()).includes('Ocultar barra'));
    }
    await shot('1-foto');
    await page.getByText('Video promocional').first().click();
    await page.waitForSelector('.video-steps');
    assert.equal(await page.locator('.topbar').isVisible(), false);
    await page.waitForFunction(() => window.bookEngine.frameMargins.top === 24);
    await shot('2-video-oculta');
    await page.getByRole('button', { name: 'Mostrar barra superior' }).click();
    await page.waitForFunction(() => window.bookEngine.frameMargins.top === 108);
    await shot('2-video-visible');
    await page.getByRole('tab', { name: 'Foto', exact: true }).click();
    assert.equal(await page.locator('.topbar').isVisible(), true);
    await page.getByRole('tab', { name: 'Video promocional' }).click();
    assert.equal(await page.locator('.topbar').isVisible(), true, 'Video recuerda su preferencia');
    await page.getByRole('button', { name: 'Ocultar barra superior' }).click();
    const steps = await page.locator('.video-steps button').allInnerTexts();
    assert.equal(steps.length, 5, 'El editor tiene cinco pasos.');
    for (const [i, label] of steps.entries()) {
      await page.locator('.video-steps button').nth(i).click();
      if (i === 1) {
        const disclosure = page.locator('.scene-content details');
        assert.equal(await disclosure.getAttribute('open'), null, 'Movimiento cerrado en una toma sin ajustes.');
        await disclosure.locator('summary').click();
        await page.locator('.scene-content').evaluate((el) => { el.scrollTop = el.scrollHeight; });
        for (const name of ['Antes', 'Despu\u00e9s', 'Duplicar', 'Quitar', 'Agregar una escena']) {
          const box = await page.locator('.scene-footer').getByRole('button', { name, exact: true }).boundingBox();
          assert.ok(box && box.y >= 0 && box.y + box.height <= viewport.height, `Acci\u00f3n visible: ${name}`);
        }
        await disclosure.locator('summary').click();
        await page.locator('.scene-content').evaluate((el) => { el.scrollTop = 0; });
      }
      await shot(`2-${i + 1}-${label.replace(/^\d\s*/, '').replace(/\W+/g, '')}`);
    }
    await page.getByRole('button', { name: 'Cerrar estudio', exact: true }).click();
    assert.equal(await page.locator('.topbar').isVisible(), true, 'Cerrar el Estudio recupera la preferencia general');
    await page.close();
  }
} finally {
  await browser.close();
}
console.log('capturas en', out);
