import { loadTypography } from './overlay';
import { TYPOGRAPHY } from './templates';
import type { TypographyId } from './model';

export interface UserFont { id: string; name: string; family: string; mime: string; data: Blob; addedAt: number }
export const MAX_FONTS = 20;
export const MAX_FONT_BYTES = 5 * 1024 * 1024;
const memory = new Map<string, UserFont>();
const faces = new Map<string, FontFace>();
const pending = new Map<string, Promise<boolean>>();

/** Valida metadatos sin depender del navegador; asigna ids compatibles con TextItem. */
export function validateFont(file: { name: string; size: number; type: string }, existing: readonly { id: string }[]) {
  if (!/\.(ttf|otf|woff2?)$/i.test(file.name)) throw new Error('Elegí una fuente .ttf, .otf, .woff o .woff2.');
  if (file.type && !/^(font\/|application\/font-)/i.test(file.type)) throw new Error('El tipo de archivo no corresponde a una fuente.');
  if (file.size <= 0 || file.size > MAX_FONT_BYTES) throw new Error('La fuente debe pesar entre 1 byte y 5 MB.');
  if (existing.length >= MAX_FONTS) throw new Error('Podés guardar hasta 20 fuentes. Borrá una antes de agregar otra.');
  const name = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Fuente';
  const slug = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'fuente';
  let id = `user:${slug}`;
  for (let n = 2; existing.some(f => f.id === id); n++) {
    const suffix = `-${n}`;
    id = `user:${slug.slice(0, 40 - suffix.length)}${suffix}`;
  }
  return { id, name, family: id.replace(':', '-') };
}

async function database<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('pdf-book-view.fonts', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('fonts', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('El almacenamiento de fuentes está bloqueado.'));
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction('fonts', mode);
      const request = work(tx.objectStore('fonts'));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
export async function listFonts(): Promise<UserFont[]> {
  try {
    const records = await database('readonly', store => store.getAll()) as UserFont[];
    for (const record of records) memory.set(record.id, record);
  } catch { /* Respaldo durante la sesión si IndexedDB está bloqueada. */ }
  return [...memory.values()].sort((a, b) => a.addedAt - b.addedAt);
}
let writes: Promise<unknown> = Promise.resolve();
export function addFont(file: File): Promise<UserFont> {
  const result = writes.then(async () => {
    const metadata = validateFont(file, await listFonts());
    const font: UserFont = { ...metadata, mime: file.type, data: file, addedAt: Date.now() };
    memory.set(font.id, font);
    try { await database('readwrite', store => store.put(font)); } catch { /* respaldo en memoria */ }
    return font;
  });
  writes = result.catch(() => {});
  return result;
}
export async function removeFont(id: string): Promise<void> {
  await writes;
  await pending.get(id);
  memory.delete(id);
  const face = faces.get(id);
  if (face) document.fonts.delete(face);
  faces.delete(id);
  try { await database('readwrite', store => store.delete(id)); } catch { /* respaldo en memoria */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('pdf-book-view.fonts'));
}
export function userFontFamily(id: string): string | undefined { return faces.get(id)?.family; }
export async function ensureFont(fontId: string): Promise<boolean> {
  if (fontId.startsWith('builtin:')) {
    const id = fontId.slice(8) as TypographyId;
    if (!(id in TYPOGRAPHY)) return false;
    try { await loadTypography(id); return true; } catch { return false; }
  }
  if (!/^user:[a-z0-9-]{1,40}$/.test(fontId)) return false;
  if (faces.has(fontId)) return true;
  if (pending.has(fontId)) return pending.get(fontId)!;
  const job = (async () => {
    try {
      const font = (await listFonts()).find(f => f.id === fontId);
      if (!font) return false;
      const face = new FontFace(font.family, await font.data.arrayBuffer());
      await face.load();
      document.fonts.add(face);
      faces.set(fontId, face);
      return true;
    } catch { return false; }
  })();
  pending.set(fontId, job);
  try { return await job; } finally { pending.delete(fontId); }
}
