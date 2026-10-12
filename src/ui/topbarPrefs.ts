/** Preferencias independientes: lectura/Foto y Video. El almacenamiento es opcional. */
export const TOPBAR_KEYS = { general: 'pdf-book-view.topbar-hidden', video: 'pdf-book-view.video-topbar-hidden' } as const;
export type TopbarPrefs = { general: boolean; video: boolean };
type StorageReader = Pick<Storage, 'getItem'>;
type StorageWriter = Pick<Storage, 'setItem'>;

export function readTopbarPrefs(storage: StorageReader): TopbarPrefs {
  const read = (key: string, fallback: boolean) => {
    try { const value = storage.getItem(key); return value === 'true' ? true : value === 'false' ? false : fallback; }
    catch { return fallback; }
  };
  return { general: read(TOPBAR_KEYS.general, false), video: read(TOPBAR_KEYS.video, true) };
}

export function topbarIsHidden(prefs: TopbarPrefs, studioOpen: boolean, tab: 'foto' | 'video'): boolean {
  return prefs[studioOpen && tab === 'video' ? 'video' : 'general'];
}

export function updateTopbarPrefs(prefs: TopbarPrefs, studioOpen: boolean, tab: 'foto' | 'video', hidden: boolean, storage: StorageWriter): TopbarPrefs {
  const scope = studioOpen && tab === 'video' ? 'video' : 'general';
  try { storage.setItem(TOPBAR_KEYS[scope], String(hidden)); } catch { /* La elección sigue vigente en memoria. */ }
  return { ...prefs, [scope]: hidden };
}
