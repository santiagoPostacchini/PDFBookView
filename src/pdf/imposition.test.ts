import { describe, expect, it } from 'vitest';
import {
  autoPlan,
  diagnosePlan,
  resizePlan,
  resolvePlan,
  sanitizePlan,
  sheetFacePages,
  updateFace,
  type Binding,
  type SheetPlan,
} from './imposition';
import { bookletLayout, simpleLayout, slotsBySource } from './layouts';

const faces = (binding: Binding, sheetCount: number) =>
  Array.from({ length: sheetCount }, (_, k) => {
    const { front, back } = sheetFacePages(binding, k, sheetCount);
    return [[...front], [...back]];
  });

describe('posiciones de lectura por hoja', () => {
  it('anidadas: frente [N−2k | 2k+1], dorso [2k+2 | N−2k−1]', () => {
    expect(faces('nested', 4)).toEqual([
      [[16, 1], [2, 15]],
      [[14, 3], [4, 13]],
      [[12, 5], [6, 11]],
      [[10, 7], [8, 9]],
    ]);
  });

  it('dobladas por separado: frente [4k+4 | 4k+1], dorso [4k+2 | 4k+3]', () => {
    expect(faces('separate', 3)).toEqual([
      [[4, 1], [2, 3]],
      [[8, 5], [6, 7]],
      [[12, 9], [10, 11]],
    ]);
  });

  it('cada encuadernación cubre 1..N exactamente una vez', () => {
    for (const binding of ['nested', 'separate'] as const) {
      for (let sheets = 1; sheets <= 64; sheets++) {
        const pages = faces(binding, sheets).flat(2).sort((a, b) => a - b);
        expect(pages).toEqual(Array.from({ length: sheets * 4 }, (_, i) => i + 1));
      }
    }
  });

  it('rechaza hojas fuera de rango', () => {
    expect(() => sheetFacePages('nested', 2, 2)).toThrow(RangeError);
    expect(() => sheetFacePages('separate', 0, 0)).toThrow(RangeError);
  });
});

describe('resolvePlan (des-imposición)', () => {
  it('plan automático = PDF impreso a doble faz en orden', () => {
    const slots = resolvePlan(autoPlan(8));
    const read = (page: number) => {
      const slot = slots[page - 1]!;
      return `${slot.source + 1}${slot.half === 'left' ? 'L' : 'R'}`;
    };
    // PDF 1 = [16 | 1], PDF 2 = [2 | 15], PDF 8 = [8 | 9]
    expect([read(16), read(1), read(2), read(15), read(8), read(9)]).toEqual(['1L', '1R', '2L', '2R', '8L', '8R']);
    expect(slots.every((s) => s !== null)).toBe(true);
  });

  it('invertir mitades intercambia qué mitad del PDF va a cada posición', () => {
    const plan = updateFace(autoPlan(2), { sheet: 0, side: 'front' }, { swap: true });
    const slots = resolvePlan(plan);
    expect(slots[0]).toMatchObject({ source: 0, half: 'left' }); // p1 ← mitad izquierda
    expect(slots[3]).toMatchObject({ source: 0, half: 'right' }); // p4 ← mitad derecha
  });

  it('una cara vacía deja sus dos páginas en blanco', () => {
    const plan = updateFace(autoPlan(4, 'separate'), { sheet: 1, side: 'back' }, { source: null });
    const slots = resolvePlan(plan);
    expect(slots[5]).toBeNull(); // p6
    expect(slots[6]).toBeNull(); // p7
    expect(slots.filter((s) => s === null)).toHaveLength(2);
  });

  it('la misma página del PDF puede usarse en varias caras', () => {
    const plan = updateFace(autoPlan(2), { sheet: 0, side: 'back' }, { source: 0 });
    const slots = resolvePlan(plan);
    expect(slots.filter((s) => s?.source === 0)).toHaveLength(4);
  });
});

describe('edición y diagnóstico del plan', () => {
  it('autoPlan usa ceil(páginas/2) hojas y deja vacía la última cara si sobra', () => {
    const plan = autoPlan(13);
    expect(plan.sheets).toHaveLength(7);
    expect(plan.sheets[6].back.source).toBeNull();
    expect(diagnosePlan(plan, 13)).toMatchObject({ pageCount: 28, repeated: [], unused: [], invalid: [] });
  });

  it('detecta páginas repetidas, sin usar, caras vacías y referencias inválidas', () => {
    let plan: SheetPlan = autoPlan(6);
    plan = updateFace(plan, { sheet: 1, side: 'front' }, { source: 0 }); // PDF 1 repetido, PDF 3 sin usar
    plan = updateFace(plan, { sheet: 2, side: 'back' }, { source: null });
    plan = updateFace(plan, { sheet: 2, side: 'front' }, { source: 40 });
    const d = diagnosePlan(plan, 6);
    expect(d.repeated).toEqual([{ source: 0, faces: [{ sheet: 0, side: 'front' }, { sheet: 1, side: 'front' }] }]);
    expect(d.unused).toEqual([2, 4, 5]);
    expect(d.emptyFaces).toEqual([{ sheet: 2, side: 'back' }]);
    expect(d.invalid).toEqual([{ sheet: 2, side: 'front' }]);
    expect(sanitizePlan(plan, 6).sheets[2].front.source).toBeNull();
  });

  it('resizePlan agrega hojas vacías o quita desde la central', () => {
    const grown = resizePlan(autoPlan(4), 3);
    expect(grown.sheets).toHaveLength(3);
    expect(grown.sheets[2]).toEqual({ front: { source: null, swap: false }, back: { source: null, swap: false } });
    expect(resizePlan(grown, 1).sheets).toEqual(autoPlan(2).sheets);
  });
});

describe('layouts', () => {
  it('modo simple: identidad sin recorte', () => {
    const layout = simpleLayout(5);
    expect(layout.slots.map((s) => s!.source)).toEqual([0, 1, 2, 3, 4]);
    expect(layout.slots.every((s) => s!.crop.w === 1)).toBe(true);
  });

  it('modo Revista: 2 páginas por cara, cada página del PDF se rasteriza una vez', () => {
    const layout = bookletLayout(autoPlan(4), 4);
    expect(layout.slots).toHaveLength(8);
    const bySource = slotsBySource(layout);
    expect([...bySource.keys()].sort()).toEqual([0, 1, 2, 3]);
    expect(bySource.get(0)).toEqual([0, 7]); // páginas 1 y 8
  });

  it('modo Revista ignora referencias fuera del PDF', () => {
    const plan = updateFace(autoPlan(2), { sheet: 0, side: 'back' }, { source: 9 });
    expect(bookletLayout(plan, 2).slots.filter((s) => s === null)).toHaveLength(2);
  });
});
