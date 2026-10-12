import { PdfSource } from '../../pdf/pdfSource';
import { canvasBlob, blobCanvas, type PackAsset } from './assets';

export async function basicPack(): Promise<PackAsset> {
  const panel = async (back: boolean) => {
    const canvas = document.createElement('canvas');
    canvas.width = 404; canvas.height = 552;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#efe0ce'; ctx.fillRect(0, 0, 404, 552);
    ctx.strokeStyle = '#b67362'; ctx.lineWidth = 3; ctx.strokeRect(22, 22, 360, 508);
    ctx.fillStyle = '#965947'; ctx.textAlign = 'center';
    ctx.font = '32px serif'; ctx.fillText(back ? 'Hecho con amor' : 'Mis recuerdos', 202, 235);
    ctx.font = '22px serif'; ctx.fillText(back ? 'Guardá cada momento' : 'Figuritas para tu álbum', 202, 285);
    return canvasBlob(canvas);
  };
  return { widthPt: 202, heightPt: 276, front: await panel(false), back: await panel(true), custom: false };
}

/** Troquel PDF: paneles frente/dorso según el troquel de referencia; imagen suelta: frente completo. */
export async function readPackArt(file: File): Promise<PackAsset> {
  const base = await basicPack();
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    const image = await blobCanvas(file);
    return { ...base, heightPt: base.widthPt * image.height / image.width, front: await canvasBlob(image), custom: true };
  }
  const pdf = await PdfSource.open(await file.arrayBuffer(), file.name);
  try {
    const [image, size] = await Promise.all([pdf.rasterize(0, 1400), pdf.pageSize(0)]);
    const crop = async (x: number) => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.width * 0.24); canvas.height = Math.round(image.height * (0.7444 - 0.2818));
      canvas.getContext('2d')!.drawImage(image, image.width * x, image.height * 0.2818,
        image.width * 0.24, image.height * (0.7444 - 0.2818), 0, 0, canvas.width, canvas.height);
      return canvasBlob(canvas);
    };
    return { widthPt: size.width * 0.24, heightPt: size.height * (0.7444 - 0.2818), front: await crop(0.43), back: await crop(0.19), custom: true };
  } finally { await pdf.destroy(); }
}
