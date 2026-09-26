import { describe, expect, it } from 'vitest';
import { autoPlan, updateFace } from './imposition';
import { loadPlan, planStorageKey, savePlan } from './planStorage';

function memoryStore() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

describe('planStorage', () => {
  it('sin asignación guardada devuelve el plan automático', () => {
    const result = loadPlan('Nuevo.pdf', 5, memoryStore());
    expect(result.restored).toBe(false);
    expect(result.plan).toEqual(autoPlan(5));
  });

  it('guarda y recupera por nombre de archivo (sin distinguir mayúsculas)', () => {
    const store = memoryStore();
    const plan = updateFace(autoPlan(6, 'separate'), { sheet: 1, side: 'back' }, { swap: true });
    savePlan('Revista.pdf', 6, plan, store);
    expect(store.data.has(planStorageKey('revista.PDF'))).toBe(true);
    const result = loadPlan('revista.PDF', 6, store);
    expect(result).toEqual({ plan, restored: true, notes: [] });
  });

  it('avisa si el PDF cambió de cantidad de páginas y limpia referencias inválidas', () => {
    const store = memoryStore();
    savePlan('a.pdf', 6, autoPlan(6), store);
    const result = loadPlan('a.pdf', 4, store);
    expect(result.restored).toBe(true);
    expect(result.notes[0]).toMatch(/6 páginas/);
    expect(result.plan.sheets[2]).toEqual({ front: { source: null, swap: false }, back: { source: null, swap: false } });
  });

  it('descarta datos dañados', () => {
    const store = memoryStore();
    store.setItem(planStorageKey('x.pdf'), '{"version":1,"sourcePageCount":2,"plan":{"binding":"??","sheets":[]}}');
    const result = loadPlan('x.pdf', 2, store);
    expect(result.restored).toBe(false);
    expect(result.notes).toHaveLength(1);
  });
});
