// Muestra genérica: movimiento suave en la portada y apertura con plano fijo.
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
const entry = readdirSync('node_modules/.remotion/chrome-headless-shell', { recursive: true, withFileTypes: true })
  .find((e) => e.isFile() && /^chrome-headless-shell(\.exe)?$/.test(e.name));
const browser = await chromium.launch({ executablePath: join(entry.parentPath ?? entry.path, entry.name), args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage();
  await page.goto(process.argv[2] ?? 'http://127.0.0.1:5175/');
  await page.setInputFiles('.topbar input[type=file]', 'out/demo/album-demo.pdf');
  await page.waitForFunction(() => window.promoLab && window.bookEngine?.currentBook);
  const video = await page.evaluate(async () => {
    const { bookEngine: engine, promoLab: lab } = window;
    const project = lab.projectFromTemplate('clasica', { format: '16:9', cloth: 'mantel-azul', windowShadow: 0.45 });
    project.scenes = project.scenes.slice(0, 2);
    project.scenes[0].camera = { zoom: { enabled: true, from: 0, to: 0.08 }, lateral: { enabled: true, amount: 0.12, direction: 'derecha' } };
    const timeline = lab.compileProject(project, engine.currentBook);
    timeline.width = 960; timeline.height = 540;
    return lab.blobToBase64(await lab.recordTimeline(engine, timeline, { fps: 24 }));
  });
  const out = resolve('out/camera-motion'); mkdirSync(out, { recursive: true });
  const path = join(out, 'zoom-y-lateral.mp4');
  writeFileSync(path, Buffer.from(video, 'base64'));
  console.log(path);
} finally { await browser.close(); }
