import { getDocument, GlobalWorkerOptions, type PDFDocumentLoadingTask, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * cmaps, fuentes estándar y decodificadores wasm que pdf.js pide a demanda (ver
 * vite.config.ts). URL absoluta: el worker de pdf.js resolvería una relativa
 * contra su propio archivo, no contra la página (p. ej. en GitHub Pages).
 */
const ASSETS = new URL(`${import.meta.env.BASE_URL}pdfjs/`, document.baseURI).href;

/** Límites de seguridad del lienzo (los navegadores fallan en silencio por encima). */
const MAX_CANVAS_SIDE = 8192;
const MAX_CANVAS_PIXELS = 36_000_000;
/** Rasterizaciones de hasta este alto se conservan todas (miniaturas); las mayores, en LRU. */
const SMALL_RASTER_HEIGHT = 480;
const MAX_LARGE_RASTERS = 6;

export interface PageSize {
  /** En puntos PDF, con la rotación de la página ya aplicada. */
  width: number;
  height: number;
}

/** Envoltorio mínimo sobre pdf.js: abrir, medir y rasterizar páginas (con caché). */
export class PdfSource {
  private readonly sizes = new Map<number, Promise<PageSize>>();
  private readonly rasters = new Map<string, Promise<HTMLCanvasElement>>(); // orden de inserción = LRU

  private constructor(
    private readonly task: PDFDocumentLoadingTask,
    private readonly doc: PDFDocumentProxy,
    readonly name: string,
  ) {}

  static async open(data: ArrayBuffer, name: string): Promise<PdfSource> {
    const task = getDocument({
      data: new Uint8Array(data),
      cMapUrl: `${ASSETS}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${ASSETS}standard_fonts/`,
      wasmUrl: `${ASSETS}wasm/`,
      iccUrl: `${ASSETS}iccs/`,
    });
    return new PdfSource(task, await task.promise, name);
  }

  get pageCount(): number {
    return this.doc.numPages;
  }

  /** Tamaño de la página `index` (0-based). */
  pageSize(index: number): Promise<PageSize> {
    let size = this.sizes.get(index);
    if (!size) {
      size = this.doc.getPage(index + 1).then((page) => {
        const { width, height } = page.getViewport({ scale: 1 });
        return { width, height };
      });
      this.sizes.set(index, size);
    }
    return size;
  }

  /**
   * Página `index` (0-based) completa rasterizada a `heightPx` de alto. El
   * lienzo devuelto es compartido (caché): no dibujar sobre él.
   */
  rasterize(index: number, heightPx: number): Promise<HTMLCanvasElement> {
    const height = Math.max(1, Math.round(heightPx));
    const key = `${index}@${height}`;
    const hit = this.rasters.get(key);
    if (hit) {
      this.rasters.delete(key);
      this.rasters.set(key, hit);
      return hit;
    }
    const pending = this.pageSize(index).then((size) => {
      const scale = Math.min(
        height / size.height,
        MAX_CANVAS_SIDE / size.width,
        MAX_CANVAS_SIDE / size.height,
        Math.sqrt(MAX_CANVAS_PIXELS / (size.width * size.height)),
      );
      return this.render(index, scale);
    });
    pending.catch(() => this.rasters.delete(key));
    this.rasters.set(key, pending);
    if (height > SMALL_RASTER_HEIGHT) this.evictLarge();
    return pending;
  }

  /** Libera el documento y su worker. */
  destroy(): Promise<void> {
    this.rasters.clear();
    return this.task.destroy();
  }

  private async render(index: number, scale: number): Promise<HTMLCanvasElement> {
    const page = await this.doc.getPage(index + 1);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    await page.render({ canvas, viewport, background: '#ffffff' }).promise;
    return canvas;
  }

  private evictLarge(): void {
    const large = [...this.rasters.keys()].filter((key) => Number(key.split('@')[1]) > SMALL_RASTER_HEIGHT);
    for (const key of large.slice(0, Math.max(0, large.length - MAX_LARGE_RASTERS))) this.rasters.delete(key);
  }
}
