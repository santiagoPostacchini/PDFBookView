import { describe, expect, it } from 'vitest';
import { loadBrand, loadDraft, newDraft, sanitizeProject, saveBrand, saveDraft } from './projectStorage';
import { projectFromTemplate } from './templates';

function memory() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
}

describe('guardado del video', () => {
  it('guarda y recupera el video de cada álbum por nombre de archivo', () => {
    const storage = memory();
    const draft = newDraft({ handle: '@wave.impresiones' });
    draft.project.scenes[2] = { kind: 'doblePagina', spread: 3, caption: 'Hola' };
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
    expect(newDraft(brand).project.texts).toMatchObject({ handle: '@wave.impresiones', cta: 'Escribinos', title: 'Álbum personalizado' });
    expect(newDraft({}).project.texts.handle).toBe('@tu.marca');
  });

  it('repara datos rotos o viejos en lugar de fallar', () => {
    const base = projectFromTemplate('clasica');
    const fixed = sanitizeProject({
      template: 'no-existe',
      format: '3:2',
      duration: 999,
      scenes: [{ kind: 'portada' }, { kind: 'volar' }, { kind: 'detalle', spread: 2.5, caption: 7, length: 'eterna' }, null],
      texts: { title: 'x'.repeat(200), handle: 42 },
      typography: 'comic',
      set: 'marte',
      lighting: 'neon',
    })!;
    expect(fixed).toMatchObject({ template: 'clasica', format: '9:16', duration: 60, typography: base.typography, set: base.set, lighting: base.lighting });
    expect(fixed.scenes).toEqual([{ kind: 'portada' }, { kind: 'detalle' }]);
    expect(fixed.texts.title).toHaveLength(60);
    expect(fixed.texts.handle).toBe('@tu.marca');
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
