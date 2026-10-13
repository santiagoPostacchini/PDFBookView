import { describe, expect, it } from 'vitest';
import { loadBrand, loadDraft, migrateV1Project, newDraft, sanitizeProject, saveBrand, saveDraft } from './projectStorage';
import { projectFromTemplate } from './templates';

function memory() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
}

describe('guardado del video', () => {
  it('recuerda ventana y oclusión independientemente del mantel, y limita intensidades inválidas', () => {
    const storage = memory(); const draft = newDraft();
    Object.assign(draft.project, { set: 'mantel-azul', windowShadow: 0.75, ambientOcclusion: 0.6, table: true });
    saveDraft('mesa.pdf', draft, storage);
    expect(loadDraft('mesa.pdf', storage)?.project).toMatchObject({ set: 'arena', cloth: 'mantel-azul', windowShadow: 0.75, ambientOcclusion: 0.6, table: true });
    expect(sanitizeProject({ ...draft.project, windowShadow: 2, ambientOcclusion: -1 })).toMatchObject({ windowShadow: 1, ambientOcclusion: 0 });
    expect(sanitizeProject({ ...draft.project, windowShadow: Number.NaN, ambientOcclusion: Number.POSITIVE_INFINITY })).toMatchObject({ windowShadow: undefined, ambientOcclusion: undefined });
  });
  it('guarda y recupera el video de cada álbum por nombre de archivo', () => {
    const storage = memory();
    const draft = newDraft({ handle: '@wave.impresiones' });
    draft.project.scenes[2] = { kind: 'doblePagina', spread: 3 };
    draft.formats = ['9:16', '1:1'];
    saveDraft('Nataly.pdf', draft, storage);
    expect(loadDraft('NATALY.PDF', storage)).toEqual(draft);
    expect(loadDraft('otro.pdf', storage)).toBeNull();
  });

  it('un video nuevo usa los textos de "Mi marca"', () => {
    const storage = memory();
    saveBrand({ handle: '@wave.impresiones', cta: 'Escribinos' }, storage);
    const brand = loadBrand(storage);
    expect(brand).toEqual({ handle: '@wave.impresiones', cta: 'Escribinos' });
    expect(newDraft(brand).project.textItems.map(t => t.text)).toContain('Escribinos');
    expect(newDraft(brand).project.textItems.map(t => t.text)).toContain('@wave.impresiones');
    expect(newDraft({}).project.textItems.find(t => t.id === 'handle')!.text).toBe('@tu.marca');
  });

  it('repara datos rotos o viejos en lugar de fallar', () => {
    const base = projectFromTemplate('clasica');
    const fixed = sanitizeProject({
      template: 'no-existe',
      format: '3:2',
      duration: 999,
      scenes: [{ kind: 'portada' }, { kind: 'volar' }, { kind: 'detalle', spread: 2.5, caption: 7, length: 'eterna' }, null],
      textItems: [{ id: 'a', text: 'x'.repeat(200), duration: -3, font: 'user:INVALID', color: '#ab12ef', x: 3, size: 0 }, { id: 'a', text: 42, start: NaN, font: 'user:valida' }],
      typography: 'comic',
      set: 'marte',
      lighting: 'neon',
    })!;
    expect(fixed).toMatchObject({ template: 'clasica', format: '9:16', duration: 60, set: base.set, lighting: base.lighting });
    expect(fixed.scenes).toEqual([{ kind: 'portada' }, { kind: 'detalle' }]);
    expect(fixed.textItems[0].text).toHaveLength(120);
    expect(fixed.textItems[0]).toMatchObject({ duration: 0.5, x: 1, size: 0.01, font: 'builtin:clasica', color: '#ab12ef' });
    expect(fixed.textItems[1]).toMatchObject({ id: 'a-2', text: '', start: 0, font: 'user:valida' });
    expect(sanitizeProject('hola')).toBeNull();

    const storage = memory();
    storage.setItem('pdf-book-view.video:roto.pdf', '{no es json');
    expect(loadDraft('roto.pdf', storage)).toBeNull();
    storage.setItem('pdf-book-view.video:viejo.pdf', JSON.stringify({ version: 0, project: base }));
    expect(loadDraft('viejo.pdf', storage)).toBeNull();
  });

  it('el formato de la vista previa siempre está entre los que se exportan', () => {
    const storage = memory();
    const draft = newDraft();
    saveDraft('a.pdf', { ...draft, formats: ['1:1', '1:1', 'cine' as never] }, storage);
    expect(loadDraft('a.pdf', storage)!.formats).toEqual(['9:16', '1:1']);
  });

  it('sin almacenamiento disponible no rompe', () => {
    const broken = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
    };
    expect(loadDraft('a.pdf', broken)).toBeNull();
    expect(() => saveDraft('a.pdf', newDraft(), broken)).not.toThrow();
    expect(loadBrand(broken)).toEqual({});
    expect(loadDraft('a.pdf', null)).toBeNull();
  });
});

it('migra los tres manteles y valida colores propios independientes', () => {
  for (const cloth of ['mantel-rosa', 'mantel-azul', 'mantel-rayas']) {
    expect(sanitizeProject({ ...projectFromTemplate('ventana'), set: cloth })).toMatchObject({ set: 'ventana', cloth, table: true });
  }
  expect(sanitizeProject({ ...projectFromTemplate('clasica'), set: 'color:#abcdef', cloth: 'color:#123456', table: false })).toMatchObject({ set: 'color:#abcdef', cloth: 'color:#123456', table: false });
  expect(sanitizeProject({ ...projectFromTemplate('clasica'), cloth: 'color:rojo' })?.cloth).toBeUndefined();
});

it('migra un borrador v1 completo conservando textos, fuentes y tiempos anteriores', () => {
  const storage = memory();
  const { textItems: _items, ...base } = projectFromTemplate('clasica');
  const old = { ...base, typography: 'manuscrita', texts: { title: 'Mi album', subtitle: 'Mi historia', cta: 'Escribime', handle: '@marca' }, scenes: [{ kind: 'doblePagina', caption: 'Primera frase', length: 'corta' }, { kind: 'portada' }, { kind: 'cierre', caption: 'Ultima frase' }] };
  storage.setItem('pdf-book-view.video:v1.pdf', JSON.stringify({ version: 1, project: old, formats: ['1:1', '9:16'] }));
  const draft = loadDraft('v1.pdf', storage)!;
  expect(draft.project.textItems.map(t => t.text)).toEqual(['Mi historia', 'Mi album', 'Primera frase', 'Escribime', '@marca', 'Ultima frase']);
  expect(draft.project.textItems.every(t => t.font === 'builtin:manuscrita')).toBe(true);
  const first = 15 * 2.1 / 7.7;
  const closing = 15 * (2.1 + 2.6) / 7.7;
  expect(draft.project.textItems[1].duration).toBeCloseTo(first);
  expect(draft.project.textItems[2].start).toBe(0.3);
  expect(draft.project.textItems[3].start).toBeCloseTo(closing + 0.7);
  expect(draft.project).not.toHaveProperty('texts');
  expect(draft.project).not.toHaveProperty('typography');
  expect(draft.project.scenes[0]).not.toHaveProperty('caption');
  saveDraft('v1.pdf', draft, storage);
  expect(JSON.parse(storage.getItem('pdf-book-view.video:v1.pdf')!).version).toBe(2);
  expect(loadDraft('v1.pdf', storage)).toEqual(draft);
});

it('migra sobre la primera escena utilizable cuando el libro no se puede abrir', () => {
  const old = { ...projectFromTemplate('clasica'), texts: { title: 'Tapa', subtitle: '', cta: 'Pedido', handle: '' }, typography: 'moderna', scenes: [{ kind: 'apertura' }, { kind: 'portada' }, { kind: 'cierre' }] };
  const migrated = migrateV1Project(old, { leafCount: 1, pageWidth: 2, pageHeight: 3 })!;
  expect(migrated.textItems.find(t => t.id === 'title')).toMatchObject({ start: 0, font: 'builtin:moderna' });
  expect(migrated.textItems.find(t => t.id === 'title')!.duration).toBeCloseTo(15 * 2.6 / 5.6);
  expect(migrated.textItems.find(t => t.text === 'Pedido')!.start).toBeCloseTo(15 * 2.6 / 5.6 + 0.7);
});
it('sanea una lista rota, mantiene una lista vacia y estabiliza ids largos duplicados', () => {
  const p = projectFromTemplate('clasica');
  const raw = { ...p, textItems: [null, false, 'mal', { ...p.textItems[0], id: 'a'.repeat(100), font: 'user:' + 'x'.repeat(41), color: 'autoX', animation: 'otra', align: 'arriba' }, { ...p.textItems[0], id: 'a'.repeat(100) }] };
  const clean = sanitizeProject(raw)!;
  expect(clean.textItems).toHaveLength(2);
  expect(clean.textItems[0]).toMatchObject({ font: 'builtin:clasica', color: 'auto', animation: 'ninguna' });
  expect(clean.textItems[0]).not.toHaveProperty('align');
  expect(sanitizeProject(clean)).toEqual(clean);
  expect(sanitizeProject({ ...p, textItems: [] })!.textItems).toEqual([]);
});
