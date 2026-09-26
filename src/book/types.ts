/**
 * Contratos del módulo 3D. El libro no sabe nada de PDFs: sólo pide imágenes
 * de páginas lógicas (0-based) a un proveedor. Cualquier fuente (PDF, imágenes,
 * un servidor) sirve si implementa PageImageProvider.
 */

export type PageQuality = 'thumb' | 'full';

export type PageImage = HTMLCanvasElement | ImageBitmap;

export interface PageImageProvider {
  /** Cantidad de páginas lógicas del libro. */
  readonly pageCount: number;
  /** Ancho / alto de una página lógica. */
  readonly pageAspect: number;
  load(pageIndex: number, quality: PageQuality): Promise<PageImage>;
  /** Imagen ya disponible sin rasterizar (p. ej. una miniatura derivada de la versión en alta). */
  peek?(pageIndex: number, quality: PageQuality): PageImage | undefined;
  dispose?(): void;
}

export interface SpreadInfo {
  /** Hojas ya pasadas al lado izquierdo (0 = libro cerrado mostrando la tapa). */
  index: number;
  leafCount: number;
  pageCount: number;
  /** Página lógica visible a la izquierda / derecha (0-based) o null si no hay. */
  leftPage: number | null;
  rightPage: number | null;
}
