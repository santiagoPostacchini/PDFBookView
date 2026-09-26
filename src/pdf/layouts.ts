import { resolvePlan, sanitizePlan, type Half, type SheetPlan } from './imposition';

/**
 * Modos de lectura: traducen páginas del PDF a páginas lógicas del libro
 * (qué página del PDF y qué recorte). Una página lógica puede quedar en blanco
 * (slot null), p. ej. una cara vacía en el modo Revista.
 */
export type ReadingModeId = 'simple' | 'booklet';

export const READING_MODES: Record<ReadingModeId, { label: string; description: string }> = {
  simple: { label: 'Páginas simples', description: '1 página del PDF = 1 cara de hoja, en orden.' },
  booklet: {
    label: 'Revista DIY / Cuadernillo',
    description: 'Cada página del PDF trae 2 páginas del libro; se asignan a las hojas físicas en el editor.',
  },
};

/** Rectángulo normalizado (0..1) sobre la página del PDF ya rotada. */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LogicalPageSlot {
  /** Página del PDF, 0-based. */
  source: number;
  crop: CropRect;
  /** Etiqueta corta para verificar el armado en la UI ("PDF 3 · izq."). */
  label: string;
}

export interface BookLayout {
  mode: ReadingModeId;
  /** Indexado por página lógica (índice 0 = página 1); null = página en blanco. */
  slots: (LogicalPageSlot | null)[];
}

export const FULL_PAGE: CropRect = { x: 0, y: 0, w: 1, h: 1 };
export const LEFT_HALF: CropRect = { x: 0, y: 0, w: 0.5, h: 1 };
export const RIGHT_HALF: CropRect = { x: 0.5, y: 0, w: 0.5, h: 1 };

const HALF_CROP: Record<Half, CropRect> = { left: LEFT_HALF, right: RIGHT_HALF };
const HALF_LABEL: Record<Half, string> = { left: 'izq.', right: 'der.' };

export function simpleLayout(sourcePageCount: number): BookLayout {
  if (sourcePageCount < 1) throw new RangeError('El PDF no tiene páginas.');
  return {
    mode: 'simple',
    slots: Array.from({ length: sourcePageCount }, (_, source) => ({ source, crop: FULL_PAGE, label: `PDF ${source + 1}` })),
  };
}

/** Modo Revista: cada página del libro es una mitad de la página del PDF asignada a su hoja. */
export function bookletLayout(plan: SheetPlan, sourcePageCount: number): BookLayout {
  if (sourcePageCount < 1) throw new RangeError('El PDF no tiene páginas.');
  return {
    mode: 'booklet',
    slots: resolvePlan(sanitizePlan(plan, sourcePageCount)).map((slot) =>
      slot ? { source: slot.source, crop: HALF_CROP[slot.half], label: `PDF ${slot.source + 1} · ${HALF_LABEL[slot.half]}` } : null,
    ),
  };
}

/** Agrupa las páginas lógicas por página del PDF: así cada una se rasteriza una sola vez. */
export function slotsBySource(layout: BookLayout): Map<number, number[]> {
  const bySource = new Map<number, number[]>();
  layout.slots.forEach((slot, pageIndex) => {
    if (!slot) return;
    const list = bySource.get(slot.source);
    if (list) list.push(pageIndex);
    else bySource.set(slot.source, [pageIndex]);
  });
  return bySource;
}
