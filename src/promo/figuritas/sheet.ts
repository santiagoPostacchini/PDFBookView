import { canvasBlob, blobCanvas, type StickerAsset } from './assets';

export interface PixelBox { x: number; y: number; width: number; height: number }

/** Componentes conexos no blancos; une separaciones de hasta 2 px dentro de una foto. */
export function findBoxes(data: Uint8ClampedArray, width: number, height: number, minSide = 30): PixelBox[] {
  if (data.length !== width * height * 4) throw new RangeError('Tamaño de imagen inválido');
  const mask = new Uint8Array(width * height);
  for (let p = 0; p < mask.length; p++) {
    const i = p * 4;
    if (data[i + 3] > 32 && Math.min(data[i], data[i + 1], data[i + 2]) < 240) mask[p] = 1;
  }
  const seen = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  const boxes: PixelBox[] = [];
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p] || seen[p]) continue;
    let start = 0, end = 1;
    queue[0] = p;
    seen[p] = 1;
    let x0 = width, y0 = height, x1 = 0, y1 = 0;
    while (start < end) {
      const point = queue[start++];
      const x = point % width, y = Math.floor(point / width);
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const next = ny * width + nx;
        if (mask[next] && !seen[next]) { seen[next] = 1; queue[end++] = next; }
      }
    }
    if (x1 - x0 + 1 >= minSide && y1 - y0 + 1 >= minSide) {
      boxes.push({ x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 });
    }
  }
  return boxes.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** PDF de figuritas: recorta sin girar y mide cada caja en puntos físicos. */
export async function readStickerSheet(file: File): Promise<StickerAsset[]> {
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    const canvas = await blobCanvas(file);
    return [{ id: crypto.randomUUID(), number: Number(file.name.match(/\d+/)?.[0] ?? 0),
      widthPt: 175, heightPt: 175 * canvas.height / canvas.width, image: await canvasBlob(canvas) }];
  }
  const { PdfSource } = await import('../../pdf/pdfSource');
  const pdf = await PdfSource.open(await file.arrayBuffer(), file.name);
  const stickers: StickerAsset[] = [];
  try {
    for (let page = 0; page < pdf.pageCount; page++) {
      const [size, image, items] = await Promise.all([pdf.pageSize(page), pdf.rasterize(page, 1400), pdf.textItems(page)]);
      const ctx = image.getContext('2d')!;
      const boxes = findBoxes(ctx.getImageData(0, 0, image.width, image.height).data, image.width, image.height, Math.round(image.height * 0.05));
      for (const box of boxes) {
        const canvas = document.createElement('canvas');
        canvas.width = box.width; canvas.height = box.height;
        canvas.getContext('2d')!.drawImage(image, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
        const number = items.find((item) => {
          const x = (item.x + item.width / 2) / size.width * image.width;
          const y = (item.y + item.height / 2) / size.height * image.height;
          return /^\d{1,3}$/.test(item.text.trim()) && x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
        });
        stickers.push({ id: crypto.randomUUID(), number: Number(number?.text.trim() ?? 0),
          widthPt: box.width / image.width * size.width, heightPt: box.height / image.height * size.height,
          image: await canvasBlob(canvas) });
      }
    }
    if (!stickers.length) throw new Error('No se encontraron figuritas separadas sobre fondo blanco. Podés cargar imágenes individuales.');
    return stickers;
  } finally { await pdf.destroy(); }
}
