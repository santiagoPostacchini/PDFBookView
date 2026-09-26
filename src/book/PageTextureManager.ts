import { CanvasTexture, SRGBColorSpace, Texture, type WebGLRenderer } from 'three';
import type { Book } from './Book';
import type { PageImage, PageImageProvider, PageQuality } from './types';

export interface TextureManagerOptions {
  /** Dobles páginas a cada lado de la actual que se cargan en alta. */
  fullRadius: number;
  /** Máximo de texturas en alta vivas en GPU. */
  maxFull: number;
}

interface Task {
  page: number;
  quality: PageQuality;
}

/**
 * Decide qué páginas rasterizar y en qué orden, crea las texturas y las asigna
 * a las caras de las hojas:
 *   1. alta calidad de la doble página visible,
 *   2. miniaturas de todo el libro (del centro hacia afuera),
 *   3. alta calidad de las dobles páginas vecinas.
 * Las texturas en alta lejanas se liberan (la cara vuelve a su miniatura).
 */
export class PageTextureManager {
  onThumbnail?: (pageIndex: number, image: PageImage) => void;
  onProgress?: (thumbsReady: number, total: number) => void;

  private readonly thumbs = new Map<number, Texture>();
  private readonly fulls = new Map<number, Texture>(); // orden de inserción = LRU
  private readonly options: TextureManagerOptions;
  private queue: Task[] = [];
  private running = false;
  private disposed = false;
  private focusSpread = 0;
  /** Páginas que no se liberan (p. ej. mientras se graba un video). */
  private readonly pinned = new Set<number>();

  constructor(
    private readonly provider: PageImageProvider,
    private readonly book: Book,
    private readonly renderer: WebGLRenderer,
    private readonly invalidate: () => void,
    options: Partial<TextureManagerOptions> = {},
  ) {
    this.options = { fullRadius: 2, maxFull: 14, ...options };
  }

  /** Llamar cada vez que cambia la doble página visible. */
  focus(spreadIndex: number): void {
    this.focusSpread = spreadIndex;
    const { pageCount } = this.provider;
    const pagesOfSpread = (s: number) => [2 * s - 1, 2 * s].filter((p) => p >= 0 && p < pageCount);

    const queue: Task[] = [];
    for (const page of pagesOfSpread(spreadIndex)) queue.push({ page, quality: 'full' });
    // Mientras gira una hoja se ve su dorso y la página que destapa: primero la siguiente.
    for (const page of [...pagesOfSpread(spreadIndex + 1), ...pagesOfSpread(spreadIndex - 1)]) {
      queue.push({ page, quality: 'full' });
    }
    const center = 2 * spreadIndex;
    const byDistance = Array.from({ length: pageCount }, (_, p) => p).sort(
      (a, b) => Math.abs(a - center) - Math.abs(b - center),
    );
    for (const page of byDistance) queue.push({ page, quality: 'thumb' });
    for (let d = 2; d <= this.options.fullRadius; d++) {
      for (const page of [...pagesOfSpread(spreadIndex + d), ...pagesOfSpread(spreadIndex - d)]) {
        queue.push({ page, quality: 'full' });
      }
    }
    this.queue = queue;
    this.evictFar();
    void this.pump();
  }

  /**
   * Carga ya (fuera de la cola) las páginas pedidas: todas en miniatura y
   * `full` en alta, y las fija para que no se liberen hasta `unpin()`.
   */
  async preload(full: readonly number[], onProgress?: (done: number, total: number) => void): Promise<void> {
    const { pageCount } = this.provider;
    const tasks: Task[] = [
      ...full.filter((p) => p >= 0 && p < pageCount).map((page) => ({ page, quality: 'full' as const })),
      ...Array.from({ length: pageCount }, (_, page) => ({ page, quality: 'thumb' as const })),
    ];
    for (const task of tasks) if (task.quality === 'full') this.pinned.add(task.page);
    let done = 0;
    for (const task of tasks) {
      if (this.disposed) return;
      const store = task.quality === 'full' ? this.fulls : this.thumbs;
      if (!store.has(task.page)) this.store(task.page, task.quality, await this.provider.load(task.page, task.quality));
      onProgress?.(++done, tasks.length);
    }
  }

  unpin(): void {
    this.pinned.clear();
    this.evictFar();
  }

  getThumbnail(pageIndex: number): PageImage | undefined {
    return this.thumbs.get(pageIndex)?.image as PageImage | undefined;
  }

  dispose(): void {
    this.disposed = true;
    this.queue = [];
    for (const texture of [...this.thumbs.values(), ...this.fulls.values()]) texture.dispose();
    this.thumbs.clear();
    this.fulls.clear();
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (!this.disposed && this.queue.length) {
        const task = this.queue.shift()!;
        const store = task.quality === 'full' ? this.fulls : this.thumbs;
        if (store.has(task.page)) continue;
        let image: PageImage;
        try {
          image = await this.provider.load(task.page, task.quality);
        } catch (error) {
          console.error(`No se pudo rasterizar la página ${task.page + 1}`, error);
          continue;
        }
        if (this.disposed) return;
        this.store(task.page, task.quality, image);
        // La versión en alta trae la miniatura de regalo (ver PdfPageProvider).
        if (task.quality === 'full' && !this.thumbs.has(task.page)) {
          const thumb = this.provider.peek?.(task.page, 'thumb');
          if (thumb) this.store(task.page, 'thumb', thumb);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private store(page: number, quality: PageQuality, image: PageImage): void {
    // La cola y preload() pueden terminar la misma página: se queda la primera.
    if ((quality === 'full' ? this.fulls : this.thumbs).has(page)) return;
    const texture = new CanvasTexture(image);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.renderer.initTexture(texture); // sube a GPU ahora, no en el primer cuadro que se vea

    if (quality === 'full') {
      this.fulls.set(page, texture);
      this.book.setPageTexture(page, texture);
      this.evictFar();
    } else {
      this.thumbs.set(page, texture);
      if (!this.fulls.has(page)) this.book.setPageTexture(page, texture);
      this.onThumbnail?.(page, image);
      this.onProgress?.(this.thumbs.size, this.provider.pageCount);
    }
    this.invalidate();
  }

  private evictFar(): void {
    const keepFrom = 2 * (this.focusSpread - this.options.fullRadius) - 1;
    const keepTo = 2 * (this.focusSpread + this.options.fullRadius);
    for (const [page, texture] of this.fulls) {
      if (this.fulls.size <= this.options.maxFull) break;
      if ((page >= keepFrom && page <= keepTo) || this.pinned.has(page)) continue;
      this.fulls.delete(page);
      this.book.setPageTexture(page, this.thumbs.get(page) ?? null);
      texture.dispose();
    }
  }
}
