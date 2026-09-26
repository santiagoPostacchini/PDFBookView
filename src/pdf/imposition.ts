/**
 * Imposición por hojas físicas.
 *
 * Un plan describe cada hoja de papel del libro, de la exterior (k = 0) a la
 * central: qué página del PDF se imprime en su frente y cuál en su dorso. Cada
 * página del PDF trae dos páginas del libro, una por mitad. Al plegar la hoja,
 * cada mitad cae en una posición de lectura que depende de la encuadernación:
 *
 *   Anidadas (cuadernillo), N = 4·hojas:
 *     frente [N−2k | 2k+1]    dorso [2k+2 | N−2k−1]
 *
 *   Cada hoja doblada por separado (pliegos de 4 páginas apilados):
 *     frente [4k+4 | 4k+1]    dorso [4k+2 | 4k+3]
 *
 * ([izquierda | derecha], páginas numeradas desde 1.)
 *
 * Todo este módulo es lógica pura (sin DOM ni pdf.js), para poder testearlo.
 */

export type Half = 'left' | 'right';
export type Binding = 'nested' | 'separate';
export type FaceSide = 'front' | 'back';

export const FACE_SIDES: readonly FaceSide[] = ['front', 'back'];

export interface FaceAssignment {
  /** Página del PDF (0-based) impresa en esta cara, o null si la cara queda en blanco. */
  source: number | null;
  /** Las mitades del PDF van invertidas: la izquierda del PDF ocupa la posición derecha y viceversa. */
  swap: boolean;
}

export interface SheetAssignment {
  front: FaceAssignment;
  back: FaceAssignment;
}

export interface SheetPlan {
  binding: Binding;
  /** De la hoja exterior (0) a la central. */
  sheets: SheetAssignment[];
}

/** Páginas del libro (1-based) en la mitad izquierda y derecha de una cara. */
export type FacePages = readonly [left: number, right: number];

/** De qué página y mitad del PDF sale una página del libro. */
export interface PageSlot {
  source: number;
  half: Half;
  sheet: number;
  side: FaceSide;
}

export interface FaceRef {
  sheet: number;
  side: FaceSide;
}

export function bookPageCount(sheetCount: number): number {
  return sheetCount * 4;
}

/** Posiciones de lectura de ambas caras de la hoja `sheet` (0 = exterior). */
export function sheetFacePages(binding: Binding, sheet: number, sheetCount: number): Record<FaceSide, FacePages> {
  if (!Number.isInteger(sheetCount) || sheetCount < 1) {
    throw new RangeError(`Cantidad de hojas inválida: ${sheetCount}.`);
  }
  if (!Number.isInteger(sheet) || sheet < 0 || sheet >= sheetCount) {
    throw new RangeError(`Hoja ${sheet} fuera de rango [0, ${sheetCount - 1}].`);
  }
  if (binding === 'nested') {
    const n = bookPageCount(sheetCount);
    return { front: [n - 2 * sheet, 2 * sheet + 1], back: [2 * sheet + 2, n - 2 * sheet - 1] };
  }
  return { front: [4 * sheet + 4, 4 * sheet + 1], back: [4 * sheet + 2, 4 * sheet + 3] };
}

/**
 * Des-imposición: devuelve un array indexado por página del libro (índice 0 =
 * página 1) con la página y mitad del PDF que hay que recortar, o null si esa
 * página queda en blanco (cara vacía).
 */
export function resolvePlan(plan: SheetPlan): (PageSlot | null)[] {
  const sheetCount = plan.sheets.length;
  const pages = new Array<PageSlot | null>(bookPageCount(sheetCount)).fill(null);
  plan.sheets.forEach((sheet, k) => {
    const positions = sheetFacePages(plan.binding, k, sheetCount);
    for (const side of FACE_SIDES) {
      const { source, swap } = sheet[side];
      if (source === null) continue;
      const [left, right] = positions[side];
      pages[(swap ? right : left) - 1] = { source, half: 'left', sheet: k, side };
      pages[(swap ? left : right) - 1] = { source, half: 'right', sheet: k, side };
    }
  });
  return pages;
}

export function emptyFace(): FaceAssignment {
  return { source: null, swap: false };
}

/**
 * Plan por defecto: las páginas del PDF en orden de impresión a doble faz
 * (PDF 1 → frente hoja 1, PDF 2 → dorso hoja 1, PDF 3 → frente hoja 2…),
 * con tantas hojas como hagan falta.
 */
export function autoPlan(sourcePageCount: number, binding: Binding = 'nested'): SheetPlan {
  const sheetCount = Math.max(1, Math.ceil(sourcePageCount / 2));
  const face = (source: number): FaceAssignment => ({ source: source < sourcePageCount ? source : null, swap: false });
  return {
    binding,
    sheets: Array.from({ length: sheetCount }, (_, k) => ({ front: face(2 * k), back: face(2 * k + 1) })),
  };
}

/** Cambia la cantidad de hojas: agrega hojas vacías o quita desde la central. */
export function resizePlan(plan: SheetPlan, sheetCount: number): SheetPlan {
  const count = Math.max(1, Math.round(sheetCount));
  const sheets = plan.sheets.slice(0, count);
  while (sheets.length < count) sheets.push({ front: emptyFace(), back: emptyFace() });
  return { ...plan, sheets };
}

export function updateFace(plan: SheetPlan, ref: FaceRef, change: Partial<FaceAssignment>): SheetPlan {
  return {
    ...plan,
    sheets: plan.sheets.map((sheet, k) => (k === ref.sheet ? { ...sheet, [ref.side]: { ...sheet[ref.side], ...change } } : sheet)),
  };
}

export interface PlanDiagnostics {
  sheetCount: number;
  pageCount: number;
  /** Páginas del PDF asignadas a más de una cara. */
  repeated: { source: number; faces: FaceRef[] }[];
  /** Páginas del PDF que no aparecen en ninguna cara (0-based). */
  unused: number[];
  emptyFaces: FaceRef[];
  /** Caras que apuntan a una página inexistente en este PDF. */
  invalid: FaceRef[];
}

export function diagnosePlan(plan: SheetPlan, sourcePageCount: number): PlanDiagnostics {
  const uses = new Map<number, FaceRef[]>();
  const emptyFaces: FaceRef[] = [];
  const invalid: FaceRef[] = [];
  plan.sheets.forEach((sheet, k) => {
    for (const side of FACE_SIDES) {
      const { source } = sheet[side];
      const ref = { sheet: k, side };
      if (source === null) emptyFaces.push(ref);
      else if (!isValidSource(source, sourcePageCount)) invalid.push(ref);
      else uses.set(source, [...(uses.get(source) ?? []), ref]);
    }
  });
  return {
    sheetCount: plan.sheets.length,
    pageCount: bookPageCount(plan.sheets.length),
    repeated: [...uses]
      .filter(([, faces]) => faces.length > 1)
      .map(([source, faces]) => ({ source, faces }))
      .sort((a, b) => a.source - b.source),
    unused: Array.from({ length: sourcePageCount }, (_, i) => i).filter((i) => !uses.has(i)),
    emptyFaces,
    invalid,
  };
}

/** Referencias a páginas inexistentes pasan a cara vacía. */
export function sanitizePlan(plan: SheetPlan, sourcePageCount: number): SheetPlan {
  const clean = (face: FaceAssignment): FaceAssignment =>
    face.source !== null && !isValidSource(face.source, sourcePageCount) ? emptyFace() : face;
  return { ...plan, sheets: plan.sheets.map((s) => ({ front: clean(s.front), back: clean(s.back) })) };
}

function isValidSource(source: number, sourcePageCount: number): boolean {
  return Number.isInteger(source) && source >= 0 && source < sourcePageCount;
}
