import type { BookShape, SceneSpec } from '../model';
import type { FiguritasKit, StickerInfo } from './assets';
export interface StickerTarget { sticker: StickerInfo; page: number; spread: number; u: number; v: number; w: number; h: number }

export function resolveTargets(scene: SceneSpec, book: BookShape, kit?: FiguritasKit): StickerTarget[] {
  if (!kit || !book.pagePt || book.leafCount < 2) return [];
  const chosen = scene.stickers ?? kit.stickers.map((s) => ({ id: s.id, slot: s.number }));
  const targets: StickerTarget[] = [];
  for (const ref of chosen) {
    const sticker = kit.stickers.find((s) => s.id === ref.id);
    if (!sticker) continue;
    const manualPage = 'page' in ref ? ref.page : undefined;
    const site = manualPage !== undefined ? { page: manualPage - 1, u: 0.5, v: 0.5 } : book.slots?.get(ref.slot ?? sticker.number)?.[0];
    if (!site || !Number.isInteger(site.page) || site.page < 1 || site.page > 2 * (book.leafCount - 1)) continue;
    const w = sticker.widthPt / book.pagePt.width, h = sticker.heightPt / book.pagePt.height;
    if (![w, h].every((n) => Number.isFinite(n) && n > 0) || site.u <= 0 || site.u >= 1 || site.v <= 0 || site.v >= 1) continue;
    // Un destino cerca del borde puede no admitir el tamaño original (p. ej. una
    // horizontal sobre casillero vertical). Se achica parejo, sin girar ni recortar.
    const fit = Math.min(1, 2 * site.u / w, 2 * (1 - site.u) / w, 2 * site.v / h, 2 * (1 - site.v) / h);
    targets.push({ sticker, ...site, spread: Math.ceil(site.page / 2), w: w * fit, h: h * fit });
  }
  return (scene.stickers === undefined ? targets.sort((a, b) => a.page - b.page).slice(0, 3) : targets.slice(0, 6));
}
