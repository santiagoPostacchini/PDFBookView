import type { BookEngine } from '../book/BookEngine';
import { PromoPlayer } from './PromoPlayer';
import { pagesToPreload, type PromoScript } from './promoScript';

export interface RecordOptions {
  width: number;
  height: number;
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

/**
 * Graba el guion en MP4 (H.264) cuadro a cuadro: cada cuadro se simula con un
 * paso fijo y se codifica con WebCodecs, así el video sale fluido aunque la
 * máquina no llegue a renderizar en tiempo real.
 */
export async function recordPromo(engine: BookEngine, script: PromoScript, options: RecordOptions): Promise<Blob> {
  const { width, height, fps = 30, signal, onProgress } = options;
  const book = engine.currentBook;
  if (!book) throw new Error('No hay un libro cargado.');

  const mb = await import('mediabunny');
  if (!(await mb.canEncodeVideo('avc', { width, height }))) {
    throw new Error('Este navegador no puede codificar video H.264. Probá con Chrome o Edge actualizados.');
  }

  // Páginas destacadas en alta (y todas en miniatura) antes del primer cuadro.
  await engine.preloadPages(pagesToPreload(script, book.pageCount), (done, total) => onProgress?.('preparando', done, total));
  signal?.throwIfAborted();

  const target = new mb.BufferTarget();
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const source = new mb.VideoSampleSource({ codec: 'avc', quality: mb.QUALITY_VERY_HIGH, keyFrameInterval: 1 });
  output.addVideoTrack(source, { frameRate: fps });
  await output.start();

  const frames = Math.round(script.duration * fps);
  const player = new PromoPlayer(engine, script);
  try {
    await engine.renderSession(width, height, script.fov, async (draw, canvas) => {
      player.reset();
      for (let i = 0; i < frames; i++) {
        signal?.throwIfAborted();
        if (i > 0) player.step(1 / fps);
        draw(i / fps);
        // El cuadro se toma del lienzo WebGL en la misma tarea en que se dibujó.
        const sample = new mb.VideoSample(new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / fps) }), {
          timestamp: i / fps,
          duration: 1 / fps,
        });
        await source.add(sample);
        sample.close();
        onProgress?.('grabando', i + 1, frames);
        if (i % 4 === 0) await yieldToEventLoop();
      }
    });
    onProgress?.('finalizando', 0, 1);
    await output.finalize();
  } catch (error) {
    await output.cancel();
    throw error;
  } finally {
    engine.unpinPages();
  }
  return new Blob([target.buffer!], { type: 'video/mp4' });
}
