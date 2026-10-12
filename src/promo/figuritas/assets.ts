export interface StickerInfo { id: string; number: number; widthPt: number; heightPt: number }
export interface StickerAsset extends StickerInfo { image: Blob }
/** `custom`: diseño cargado por la persona (true) o paquete básico (false). */
export interface PackAsset { widthPt: number; heightPt: number; front: Blob; back: Blob; custom?: boolean }
export interface FiguritasKit { stickers: StickerInfo[]; pack: Pick<PackAsset, 'widthPt' | 'heightPt'> }
export interface FiguritasLibrary { stickers: StickerAsset[]; pack: PackAsset }
export interface FiguritasImages { stickers: ReadonlyMap<string, HTMLCanvasElement>; front: HTMLCanvasElement; back: HTMLCanvasElement }

export const canvasBlob = (canvas: HTMLCanvasElement): Promise<Blob> => new Promise((resolve, reject) =>
  canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('No se pudo guardar la imagen')), 'image/png'));

export async function blobCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    return canvas;
  } finally { bitmap.close(); }
}

export async function libraryImages(library: FiguritasLibrary): Promise<FiguritasImages> {
  const [front, back, stickers] = await Promise.all([
    blobCanvas(library.pack.front), blobCanvas(library.pack.back),
    Promise.all(library.stickers.map(async (s) => [s.id, await blobCanvas(s.image)] as const)),
  ]);
  return { front, back, stickers: new Map(stickers) };
}
