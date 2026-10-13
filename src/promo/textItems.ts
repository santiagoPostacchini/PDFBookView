import type { TextItem } from './model';
export const MAX_TEXT_ITEMS = 30;
const number = (v: unknown, fallback: number, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
/** Saneo compartido por persistencia y edición; ids repetidos se reparan determinísticamente. */
export function sanitizeTextItems(raw: unknown): TextItem[] {
  if (!Array.isArray(raw)) return [];
  const ids = new Set<string>();
  return raw.filter(v => typeof v === 'object' && v !== null && !Array.isArray(v)).slice(0, MAX_TEXT_ITEMS).map((v, i) => {
    const base = typeof v.id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v.id) ? v.id : `texto-${i + 1}`;
    let id = base;
    for (let n = 2; ids.has(id); n++) id = `${base.slice(0, 90)}-${n}`;
    ids.add(id);
    return { id, text: typeof v.text === 'string' ? v.text.slice(0, 120) : '',
      start: number(v.start, 0, 0, 3600), duration: number(v.duration, 2, 0.5, 3600),
      x: number(v.x, 0.5, 0, 1), y: number(v.y, 0.2, 0, 1), size: number(v.size, 0.04, 0.01, 0.3),
      color: typeof v.color === 'string' && /^(auto|#[0-9a-f]{6})$/i.test(v.color) ? v.color.toLowerCase() : 'auto',
      font: typeof v.font === 'string' && /^(builtin:(clasica|moderna|manuscrita)|user:[a-z0-9-]{1,40})$/.test(v.font) ? v.font : 'builtin:clasica',
      ...(typeof v.bold === 'boolean' ? { bold: v.bold } : {}),
      ...( ['izquierda', 'centro', 'derecha'].includes(v.align) ? { align: v.align as TextItem['align'] } : {}),
      animation: ['subir', 'fundido', 'ninguna'].includes(v.animation) ? v.animation : 'ninguna',
    };
  });
}
