// Comprueba F-2 con el álbum indicado, sin copiarlo al repositorio.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
const file = process.argv[2];
assert.ok(file, 'Uso: node scripts/slots-e2e.mjs <álbum.pdf> [URL]');
const entry = readdirSync('node_modules/.remotion/chrome-headless-shell', { recursive: true, withFileTypes: true })
  .find((e) => e.isFile() && /^chrome-headless-shell(\.exe)?$/.test(e.name));
const browser = await chromium.launch({ executablePath: join(entry.parentPath ?? entry.path, entry.name) });
try {
  const page = await browser.newPage();
  await page.goto(process.argv[3] ?? 'http://127.0.0.1:5175/');
  const result = await page.evaluate(async (data) => {
    const { PdfSource } = await import('/src/pdf/pdfSource.ts');
    const { findNumberedSlots } = await import('/src/pdf/slots.ts');
    const { bookletLayout } = await import('/src/pdf/layouts.ts');
    const { autoPlan } = await import('/src/pdf/imposition.ts');
    const pdf = await PdfSource.open(new Uint8Array(data).buffer, 'verificación');
    try {
      const layout = bookletLayout(autoPlan(pdf.pageCount), pdf.pageCount);
      const slots = await findNumberedSlots(pdf, layout);
      const site = slots.get(13)?.[0];
      const logical = layout.slots[site.page];
      const size = await pdf.pageSize(logical.source);
      // Centro del corazón 13 medido en p08.png: (57,87) sobre 420×297 px.
      // (103,182) es el inicio/baseline del texto, no el centro.
      const expected = { u: (57 / 420 - logical.crop.x) / logical.crop.w,
        v: (87 / 297 - logical.crop.y) / logical.crop.h };
      return { count: slots.size, site, source: logical.source, expected, fifteen: slots.get(15) };
    } finally { await pdf.destroy(); }
  }, [...readFileSync(file)]);
  console.log('Casilleros:', result);
  assert.equal(result.count, 33);
  assert.equal(result.source, 7);
  assert.ok(Math.abs(result.site.u - result.expected.u) < 0.01);
  assert.ok(Math.abs(result.site.v - result.expected.v) < 0.01);
  assert.equal(result.fifteen.length, 1);
  console.log('F-2 en verde:', result);
} finally { await browser.close(); }
