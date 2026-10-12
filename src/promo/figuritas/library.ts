import type { FiguritasLibrary } from './assets';
const memory = new Map<string, FiguritasLibrary>();
const key = (album: string) => album.toLowerCase();
const open = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const request = indexedDB.open('pdf-book-view.figuritas', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('albums');
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

export async function saveLibrary(album: string, library: FiguritasLibrary): Promise<void> {
  memory.set(key(album), library);
  let db: IDBDatabase | undefined;
  try {
    db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db!.transaction('albums', 'readwrite');
      tx.objectStore('albums').put({ version: 1, library }, key(album));
      tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } catch { /* El respaldo en memoria permite seguir si el almacenamiento está bloqueado. */ }
  finally { db?.close(); }
}

export async function loadLibrary(album: string): Promise<FiguritasLibrary | null> {
  let db: IDBDatabase | undefined;
  try {
    db = await open();
    const record = await new Promise<{ version: number; library: FiguritasLibrary } | undefined>((resolve, reject) => {
      const request = db!.transaction('albums').objectStore('albums').get(key(album));
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    if (record?.version === 1 && Array.isArray(record.library?.stickers) && record.library.pack?.front instanceof Blob && record.library.pack.back instanceof Blob
      && record.library.stickers.every((s) => typeof s.id === 'string' && s.image instanceof Blob && s.widthPt > 0 && s.heightPt > 0)) {
      memory.set(key(album), record.library);
    }
  } catch { /* respaldo en memoria */ }
  finally { db?.close(); }
  return memory.get(key(album)) ?? null;
}
