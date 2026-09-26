import { autoPlan, sanitizePlan, type Binding, type FaceAssignment, type SheetPlan } from './imposition';

/**
 * Guarda el plan de hojas por archivo (clave = nombre del PDF), así al volver a
 * abrir el mismo archivo —aunque se haya reexportado— se recupera la asignación.
 */

const PREFIX = 'pdf-book-view.plan:';
const VERSION = 1;
const MAX_SHEETS = 1000;

interface StoredPlan {
  version: typeof VERSION;
  sourcePageCount: number;
  plan: SheetPlan;
}

export interface LoadedPlan {
  plan: SheetPlan;
  /** true si se recuperó una asignación guardada. */
  restored: boolean;
  notes: string[];
}

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStore(): KeyValueStore | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // almacenamiento bloqueado por el navegador
  }
}

export function planStorageKey(fileName: string): string {
  return PREFIX + fileName.trim().toLowerCase();
}

export function loadPlan(fileName: string, sourcePageCount: number, store = defaultStore()): LoadedPlan {
  const fresh: LoadedPlan = { plan: autoPlan(sourcePageCount), restored: false, notes: [] };
  let raw: string | null = null;
  try {
    raw = store?.getItem(planStorageKey(fileName)) ?? null;
  } catch {
    return fresh;
  }
  if (!raw) return fresh;

  const stored = parseStoredPlan(raw);
  if (!stored) {
    return { ...fresh, notes: ['La asignación guardada para este archivo no se pudo leer; se generó una nueva.'] };
  }
  const notes: string[] = [];
  if (stored.sourcePageCount !== sourcePageCount) {
    notes.push(
      `La asignación guardada era para un PDF de ${stored.sourcePageCount} páginas y este tiene ${sourcePageCount}: revisá las hojas.`,
    );
  }
  return { plan: sanitizePlan(stored.plan, sourcePageCount), restored: true, notes };
}

export function savePlan(fileName: string, sourcePageCount: number, plan: SheetPlan, store = defaultStore()): void {
  const payload: StoredPlan = { version: VERSION, sourcePageCount, plan };
  try {
    store?.setItem(planStorageKey(fileName), JSON.stringify(payload));
  } catch {
    /* cuota llena o almacenamiento bloqueado: la asignación sólo vive en memoria */
  }
}

export function forgetPlan(fileName: string, store = defaultStore()): void {
  try {
    store?.removeItem(planStorageKey(fileName));
  } catch {
    /* nada que borrar */
  }
}

function parseStoredPlan(raw: string): StoredPlan | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data) || data.version !== VERSION || !isCount(data.sourcePageCount) || !isRecord(data.plan)) return null;
  const { binding, sheets } = data.plan;
  if (!isBinding(binding) || !Array.isArray(sheets) || sheets.length < 1 || sheets.length > MAX_SHEETS) return null;
  if (!sheets.every((s) => isRecord(s) && isFace(s.front) && isFace(s.back))) return null;
  return { version: VERSION, sourcePageCount: data.sourcePageCount, plan: { binding, sheets } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isBinding(value: unknown): value is Binding {
  return value === 'nested' || value === 'separate';
}

function isFace(value: unknown): value is FaceAssignment {
  return isRecord(value) && (value.source === null || isCount(value.source)) && typeof value.swap === 'boolean';
}
