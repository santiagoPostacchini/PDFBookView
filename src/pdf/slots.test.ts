import { describe, expect, it } from 'vitest';
import { findNumberedSlots, numberedCenters } from './slots';
import { LEFT_HALF, RIGHT_HALF, type BookLayout } from './layouts';

describe('casilleros numerados', () => {
  const item = (text: string, x: number, y = 40) => ({ text, x, y, width: 10, height: 20 });
  it('une duplicados próximos, conserva los distantes e ignora texto y cero', () => {
    const centers = numberedCenters([item('15', 20), item('15', 24), item('15', 150), item('álbum', 10), item('0', 30)], { width: 200, height: 100 });
    expect([...centers.keys()]).toEqual([15]);
    expect(centers.get(15)).toEqual([{ u: 27 / 200, v: 0.5 }, { u: 155 / 200, v: 0.5 }]);
  });
  it('mapea recortes a páginas lógicas y excluye tapas y páginas vacías', async () => {
    const layout: BookLayout = { mode: 'booklet', slots: [
      { source: 0, crop: LEFT_HALF, label: '' },
      { source: 1, crop: RIGHT_HALF, label: '' },
      { source: 1, crop: LEFT_HALF, label: '' }, null,
      { source: 0, crop: RIGHT_HALF, label: '' },
      { source: 0, crop: LEFT_HALF, label: '' },
    ] };
    const found = await findNumberedSlots({ pageSize: async () => ({ width: 200, height: 100 }),
      textItems: async (source) => source === 1 ? [item('13', 145), item('14', 45)] : [item('99', 20)] }, layout);
    expect(found.get(13)).toEqual([{ page: 1, u: 0.5, v: 0.5 }]);
    expect(found.get(14)).toEqual([{ page: 2, u: 0.5, v: 0.5 }]);
    expect(found.has(99)).toBe(false);
  });
});
