import type { PageImageProvider, PageQuality } from '../book/types';
import type { BookLayout } from './layouts';
import { slotsBySource } from './layouts';
import { blankPage, downscaleCanvas, layoutAspect, renderSourceSlots } from './pageExtraction';
import type { PdfSource } from './pdfSource';

export interface PdfPageProviderOptions {
  /** Alto en px de la textura de alta calidad. */
  fullHeight: number;
  /** Alto en px de la miniatura (textura provisoria y tira de páginas). */
  thumbHeight: number;
  /** Cuántas páginas en alta guardar en memoria de CPU. */
  fullCacheSize: number;
}

export const THUMB_HEIGHT = 320;
const DEFAULTS: PdfPageProviderOptions = { fullHeight: 1600, thumbHeight: THUMB_HEIGHT, fullCacheSize: 12 };

/**
 * Proveedor perezoso de páginas lógicas a partir de un PDF + layout. Las
 * rasterizaciones de páginas del PDF se cachean en PdfSource, así que un
 * layout nuevo sobre el mismo PDF (p. ej. al editar las hojas) sólo recorta.
 */
export class PdfPageProvider implements PageImageProvider {
  readonly pageCount: number;
  private readonly options: PdfPageProviderOptions;
  private readonly bySource: Map<number, number[]>;
  private readonly thumbs = new Map<number, HTMLCanvasElement>();
  private readonly fulls = new Map<number, HTMLCanvasElement>(); // orden de inserción = LRU
  private readonly inflight = new Map<string, Promise<Map<number, HTMLCanvasElement>>>();
  private blank: HTMLCanvasElement | null = null;

  private constructor(
    private readonly pdf: PdfSource,
    readonly layout: BookLayout,
    readonly pageAspect: number,
    options: Partial<PdfPageProviderOptions>,
  ) {
    this.options = { ...DEFAULTS, ...options };
    this.pageCount = layout.slots.length;
    this.bySource = slotsBySource(layout);
  }

  static async create(pdf: PdfSource, layout: BookLayout, options: Partial<PdfPageProviderOptions> = {}) {
    // El libro usa la proporción de la primera página con contenido para todas las hojas.
    return new PdfPageProvider(pdf, layout, await layoutAspect(pdf, layout), options);
  }

  async load(pageIndex: number, quality: PageQuality): Promise<HTMLCanvasElement> {
    const slot = this.layout.slots[pageIndex];
    if (!slot) return (this.blank ??= blankPage(this.pageAspect));
    const cached = this.peek(pageIndex, quality);
    if (cached) return cached;
    const key = `${quality}:${slot.source}`;
    let pending = this.inflight.get(key);
    if (!pending) {
      pending = this.renderSource(slot.source, quality).finally(() => this.inflight.delete(key));
      this.inflight.set(key, pending);
    }
    return (await pending).get(pageIndex)!;
  }

  peek(pageIndex: number, quality: PageQuality): HTMLCanvasElement | undefined {
    if (!this.layout.slots[pageIndex]) return (this.blank ??= blankPage(this.pageAspect));
    if (quality === 'thumb') return this.thumbs.get(pageIndex);
    const hit = this.fulls.get(pageIndex);
    if (hit) {
      this.fulls.delete(pageIndex);
      this.fulls.set(pageIndex, hit);
    }
    return hit;
  }

  dispose(): void {
    this.thumbs.clear();
    this.fulls.clear();
  }

  private async renderSource(source: number, quality: PageQuality) {
    const { fullHeight, thumbHeight, fullCacheSize } = this.options;
    const pages = this.bySource.get(source)!;
    const height = quality === 'full' ? fullHeight : thumbHeight;
    const canvases = await renderSourceSlots(this.pdf, this.layout, source, pages, height);
    for (const [pageIndex, canvas] of canvases) {
      if (quality === 'thumb') {
        this.thumbs.set(pageIndex, canvas);
        continue;
      }
      this.fulls.set(pageIndex, canvas);
      // La miniatura sale gratis de la versión en alta.
      if (!this.thumbs.has(pageIndex)) this.thumbs.set(pageIndex, downscaleCanvas(canvas, thumbHeight));
    }
    while (this.fulls.size > fullCacheSize) this.fulls.delete(this.fulls.keys().next().value!);
    return canvases;
  }
}
