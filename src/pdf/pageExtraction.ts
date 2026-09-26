import type { SheetPlan } from './imposition';
import { bookletLayout, slotsBySource, type BookLayout, type CropRect } from './layouts';
import type { PdfSource } from './pdfSource';

export interface ExtractOptions {
  /** Alto en píxeles de cada página lógica resultante. */
  pageHeightPx: number;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

const DEFAULT_ASPECT = Math.SQRT1_2; // A-series vertical

/** Recorta un rectángulo normalizado de un lienzo y lo devuelve como lienzo nuevo. */
export function cropCanvas(source: HTMLCanvasElement, crop: CropRect): HTMLCanvasElement {
  const x0 = Math.round(crop.x * source.width);
  const y0 = Math.round(crop.y * source.height);
  const x1 = Math.round((crop.x + crop.w) * source.width);
  const y1 = Math.round((crop.y + crop.h) * source.height);
  const out = document.createElement('canvas');
  out.width = Math.max(1, x1 - x0);
  out.height = Math.max(1, y1 - y0);
  out.getContext('2d')!.drawImage(source, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

/** Reescala un lienzo a un alto dado manteniendo la proporción. */
export function downscaleCanvas(source: HTMLCanvasElement, heightPx: number): HTMLCanvasElement {
  const scale = Math.min(1, heightPx / source.height);
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(source.width * scale));
  out.height = Math.max(1, Math.round(source.height * scale));
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, out.width, out.height);
  return out;
}

/** Página en blanco (cara vacía) con la proporción del libro. */
export function blankPage(aspect: number, heightPx = 64): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.height = heightPx;
  out.width = Math.max(1, Math.round(heightPx * aspect));
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  return out;
}

/** Proporción (ancho/alto) de la primera página lógica con contenido. */
export async function layoutAspect(pdf: PdfSource, layout: BookLayout): Promise<number> {
  const first = layout.slots.find((slot) => slot !== null);
  if (!first) return DEFAULT_ASPECT;
  const size = await pdf.pageSize(first.source);
  return (size.width * first.crop.w) / (size.height * first.crop.h);
}

/**
 * Rasteriza UNA página del PDF y la corta en todas las páginas lógicas que
 * contiene (1 en modo simple, 2 en modo Revista). La escala se elige para que
 * cada recorte tenga `pageHeightPx` de alto.
 *
 * @returns mapa índice-de-página-lógica → lienzo recortado.
 */
export async function renderSourceSlots(
  pdf: PdfSource,
  layout: BookLayout,
  source: number,
  pageIndices: readonly number[],
  pageHeightPx: number,
): Promise<Map<number, HTMLCanvasElement>> {
  const cropHeight = Math.max(...pageIndices.map((i) => layout.slots[i]!.crop.h));
  const sheet = await pdf.rasterize(source, pageHeightPx / cropHeight);
  const result = new Map<number, HTMLCanvasElement>();
  for (const pageIndex of pageIndices) {
    const { crop } = layout.slots[pageIndex]!;
    const isFull = crop.x === 0 && crop.y === 0 && crop.w === 1 && crop.h === 1;
    result.set(pageIndex, isFull ? sheet : cropCanvas(sheet, crop));
  }
  return result;
}

/**
 * Convierte el PDF a la secuencia de páginas del libro (1..N) según el layout:
 * cada página del PDF se rasteriza una sola vez, se corta en sus mitades y cada
 * mitad se deposita en su posición de lectura. Las caras vacías salen en blanco.
 */
export async function extractLogicalPages(
  pdf: PdfSource,
  layout: BookLayout,
  { pageHeightPx, signal, onProgress }: ExtractOptions,
): Promise<HTMLCanvasElement[]> {
  const aspect = await layoutAspect(pdf, layout);
  const ordered = layout.slots.map((slot) => (slot ? null : blankPage(aspect, pageHeightPx)));
  const bySource = slotsBySource(layout);
  let done = 0;
  for (const [source, pageIndices] of bySource) {
    signal?.throwIfAborted();
    const pages = await renderSourceSlots(pdf, layout, source, pageIndices, pageHeightPx);
    for (const [pageIndex, canvas] of pages) ordered[pageIndex] = canvas;
    onProgress?.(++done, bySource.size);
  }
  return ordered as HTMLCanvasElement[];
}

/**
 * Des-imposición en "Modo Revista DIY": aplica el plan de hojas físicas, corta
 * cada página del PDF por la mitad (eje vertical) y devuelve las texturas en
 * orden de lectura (índice 0 = página 1 … índice N−1 = página N).
 */
export function deimposeBooklet(pdf: PdfSource, plan: SheetPlan, options: ExtractOptions): Promise<HTMLCanvasElement[]> {
  return extractLogicalPages(pdf, bookletLayout(plan, pdf.pageCount), options);
}
