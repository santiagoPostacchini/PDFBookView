import { afterEach, expect, it, vi } from 'vitest';
import { loadLibrary, saveLibrary } from './library';
afterEach(() => vi.unstubAllGlobals());
it('conserva cada álbum en memoria si IndexedDB está bloqueado', async () => {
  vi.stubGlobal('indexedDB', { open: () => { throw new Error('Bloqueado'); } });
  const blob = new Blob(['imagen']);
  const library = { stickers: [{ id: '13', number: 13, widthPt: 175, heightPt: 243, image: blob }], pack: { widthPt: 202, heightPt: 276, front: blob, back: blob } };
  await saveLibrary('álbum-memoria.pdf', library);
  expect(await loadLibrary('ÁLBUM-MEMORIA.PDF')).toEqual(library);
  expect(await loadLibrary('otro-álbum.pdf')).toBeNull();
});
it('recuerda si el paquete es un diseño propio o el básico', async () => {
  vi.stubGlobal('indexedDB', { open: () => { throw new Error('Bloqueado'); } });
  const blob = new Blob(['imagen']);
  const sticker = { id: '13', number: 13, widthPt: 175, heightPt: 243, image: blob };
  await saveLibrary('paquete-propio.pdf', { stickers: [sticker], pack: { widthPt: 202, heightPt: 276, front: blob, back: blob, custom: true } });
  await saveLibrary('paquete-basico.pdf', { stickers: [sticker], pack: { widthPt: 202, heightPt: 276, front: blob, back: blob, custom: false } });
  expect((await loadLibrary('paquete-propio.pdf'))?.pack.custom).toBe(true);
  expect((await loadLibrary('paquete-basico.pdf'))?.pack.custom).toBe(false);
});
