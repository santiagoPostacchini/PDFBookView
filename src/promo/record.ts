import type { BookEngine } from '../book/BookEngine';
import { SET_PRESETS } from '../book/StageSet';
import { pagesToPreload, type Timeline } from './compile';
import { drawOverlay, loadTypography, overlayTheme } from './overlay';
import { TimelinePlayer } from './TimelinePlayer';

export interface ProductionOptions {
  fps?: number;
  signal?: AbortSignal;
  onProgress?: (phase: 'preparando' | 'grabando' | 'finalizando', done: number, total: number) => void;
}

/** Cede el hilo sin depender de timers (que el navegador frena en pestañas ocultas). */
const yieldToEventLoop = () =>
  new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => resolve();
    channel.port2.postMessage(null);
  });

const setSpec = (id: string) => SET_PRESETS.find((s) => s.id === id) ?? SET_PRESETS[0];

/**
 * Prepara el motor para la línea de tiempo (escenario, luz, tipografías, páginas
 * en alta), corre `work` cuadro a cuadro sobre un lienzo que suma 3D + textos y
 * deja todo como estaba.
 */
async function produce<T>(
  engine: BookEngine,
  timeline: Timeline,
  options: ProductionOptions,
  work: (frame: (i: number) => HTMLCanvasElement, player: TimelinePlayer) => Promise<T>,
): Promise<T> {
  const book = engine.currentBook;
  if (!book) throw new Error('No hay un libro cargado.');
  const fps = options.fps ?? 30;
  const previous = { set: engine.stageSet, lighting: engine.lightingId };
  const spec = setSpec(timeline.set);
  await loadTypography(timeline.typography);
  engine.setLighting(timeline.lighting);
  engine.setSet(spec);
  try {
    await engine.preloadPages(pagesToPreload(timeline, book.pageCount), (done, total) => options.onProgress?.('preparando', done, total));
    options.signal?.throwIfAborted();
    const composite = document.createElement('canvas');
    composite.width = timeline.width;
    composite.height = timeline.height;
    const ctx = composite.getContext('2d')!;
    const theme = overlayTheme(spec.color);
    const player = new TimelinePlayer(engine, timeline);
    return await engine.renderSession(timeline.width, timeline.height, timeline.fov, async (draw, canvas) => {
      player.reset();
      let simulated = 0;
      const frame = (i: number) => {
        // Avanza la simulación hasta el cuadro i (los giros de hojas tienen estado).
        while (simulated < i) {
          player.step(1 / fps);
          simulated++;
        }
        draw(i / fps);
        // El cuadro se toma del lienzo WebGL en la misma tarea en que se dibujó.
        ctx.drawImage(canvas, 0, 0);
        drawOverlay(ctx, timeline, i / fps, theme);
        return composite;
      };
      return work(frame, player);
    });
  } finally {
    engine.unpinPages();
    engine.setSet(previous.set);
    engine.setLighting(previous.lighting);
  }
}

/** Graba la línea de tiempo en MP4 (H.264) cuadro a cuadro con WebCodecs. */
export async function recordTimeline(engine: BookEngine, timeline: Timeline, options: ProductionOptions = {}): Promise<Blob> {
  const fps = options.fps ?? 30;
  const { width, height } = timeline;
  const mb = await import('mediabunny');
  if (!(await mb.canEncodeVideo('avc', { width, height }))) {
    throw new Error('Este navegador no puede codificar video H.264. Probá con Chrome o Edge actualizados.');
  }
  const target = new mb.BufferTarget();
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const source = new mb.VideoSampleSource({ codec: 'avc', quality: mb.QUALITY_VERY_HIGH, keyFrameInterval: 1 });
  output.addVideoTrack(source, { frameRate: fps });
  await output.start();
  const frames = Math.round(timeline.duration * fps);
  try {
    await produce(engine, timeline, options, async (frame) => {
      for (let i = 0; i < frames; i++) {
        options.signal?.throwIfAborted();
        const canvas = frame(i);
        const sample = new mb.VideoSample(new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / fps) }), {
          timestamp: i / fps,
          duration: 1 / fps,
        });
        await source.add(sample);
        sample.close();
        options.onProgress?.('grabando', i + 1, frames);
        if (i % 4 === 0) await yieldToEventLoop();
      }
    });
    options.onProgress?.('finalizando', 0, 1);
    await output.finalize();
  } catch (error) {
    await output.cancel();
    throw error;
  }
  return new Blob([target.buffer!], { type: 'video/mp4' });
}

/** Cuadros sueltos (PNG) en los instantes pedidos: para miniaturas del guion y hojas de contacto. */
export async function renderStills(engine: BookEngine, timeline: Timeline, times: number[], options: ProductionOptions = {}): Promise<Blob[]> {
  const fps = options.fps ?? 30;
  const order = times.map((t, i) => ({ frame: Math.round(t * fps), i })).sort((a, b) => a.frame - b.frame);
  const out: Blob[] = new Array(times.length);
  await produce(engine, timeline, options, async (frame) => {
    for (const { frame: f, i } of order) {
      const canvas = frame(Math.min(f, Math.round(timeline.duration * fps) - 1));
      out[i] = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png'));
    }
  });
  return out;
}
