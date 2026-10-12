import type { PdfSource, PdfTextItem, PageSize } from './pdfSource';
import type { BookLayout } from './layouts';

export interface SlotSite { page: number; u: number; v: number }
type TextSource = Pick<PdfSource, 'textItems' | 'pageSize'>;

/** Une números repetidos cerca (sombras/contornos) y conserva apariciones distantes. */
export function numberedCenters(items: readonly PdfTextItem[], size: PageSize): Map<number, { u: number; v: number }[]> {
  const numbers = new Map<number, { x: number; y: number; count: number }[]>();
  for (const item of items) {
    if (!/^\d{1,3}$/.test(item.text.trim())) continue;
    const number = Number(item.text.trim());
    if (number < 1) continue;
    const x = item.x + item.width / 2;
    const y = item.y + item.height / 2;
    const list = numbers.get(number) ?? [];
    const near = list.find((p) => Math.hypot(p.x - x, p.y - y) <= 6);
    if (near) {
      near.x = (near.x * near.count + x) / (near.count + 1);
      near.y = (near.y * near.count + y) / ++near.count;
    } else list.push({ x, y, count: 1 });
    numbers.set(number, list);
  }
  return new Map([...numbers].map(([number, list]) => [number, list.map(({ x, y }) => ({ u: x / size.width, v: y / size.height }))]));
}

/** Casilleros en páginas lógicas interiores; respeta el armado y los recortes actuales. */
export async function findNumberedSlots(pdf: TextSource, layout: BookLayout): Promise<Map<number, SlotSite[]>> {
  const sources = new Map<number, Map<number, { u: number; v: number }[]>>();
  for (const source of new Set(layout.slots.flatMap((s) => s ? [s.source] : []))) {
    const [items, size] = await Promise.all([pdf.textItems(source), pdf.pageSize(source)]);
    sources.set(source, numberedCenters(items, size));
  }
  const result = new Map<number, SlotSite[]>();
  const lastInterior = 2 * (Math.ceil(layout.slots.length / 2) - 1);
  layout.slots.forEach((slot, page) => {
    if (!slot || page < 1 || page > lastInterior) return;
    const { x, y, w, h } = slot.crop;
    for (const [number, centers] of sources.get(slot.source) ?? []) {
      for (const center of centers) {
        const u = (center.u - x) / w;
        const v = (center.v - y) / h;
        if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
        const sites = result.get(number) ?? [];
        sites.push({ page, u, v });
        result.set(number, sites);
      }
    }
  });
  return result;
}
