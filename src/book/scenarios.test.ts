import { describe, expect, it } from 'vitest';
import { BACKDROP_PRESETS } from './Stage';
import { SET_PRESETS, type Surface } from './StageSet';
import { migratePhotoBackdrop, photoScenario, resolveScenario, SCENARIOS } from './scenarios';
import { sanitizeProject } from '../promo/projectStorage';
import { projectFromTemplate } from '../promo/templates';

describe('catálogo compartido', () => {
  it('tiene ids únicos y todos resuelven a una spec', () => {
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
    expect(SET_PRESETS).toBe(SCENARIOS);
    for (const s of SCENARIOS) expect(resolveScenario(s.id)).toEqual(s);
  });
  it('mantiene cada color y superficie de los ajustes anteriores de Foto', () => {
    for (const surface of ['liso', 'papel', 'lino'] as Surface[]) {
      for (const old of BACKDROP_PRESETS) {
        const migrated = migratePhotoBackdrop(old.id);
        expect(photoScenario(migrated, '#123456', surface)).toEqual({ color: old.inner, surface });
        expect(migratePhotoBackdrop(migrated, 1)).toBe(migrated);
      }
      expect(photoScenario(migratePhotoBackdrop('custom'), '#123456', surface)).toEqual({ color: '#123456', surface });
      expect(photoScenario(migratePhotoBackdrop('transparent'), '#123456', surface)).toBeNull();
    }
  });
  it('conserva los ids y las specs históricas de Video', () => {
    const colors = { arena: '#dcc6a8', lino: '#ddd3c4', salvia: '#bcc7ae', rosa: '#e9c6c2', carbon: '#3b3734', noche: '#28324c', ventana: '#e7d5b9', 'mantel-rosa': '#f4e9dc', 'mantel-azul': '#f4e9dc', 'mantel-rayas': '#f4e9dc' };
    for (const [id, color] of Object.entries(colors)) {
      expect(resolveScenario(id)?.color).toBe(color);
      expect(sanitizeProject({ ...projectFromTemplate('clasica'), set: id })?.set).toBe(id);
    }
    expect(sanitizeProject({ ...projectFromTemplate('clasica'), set: 'automatico' })?.set).toBe('automatico');
    expect(resolveScenario('ventana')).toMatchObject({ surface: 'lino', windowShadow: true });
    for (const [id, tablecloth] of [['mantel-rosa', 'vichy-rosa'], ['mantel-azul', 'vichy-azul'], ['mantel-rayas', 'rayas-salvia']]) expect(resolveScenario(id)).toMatchObject({ surface: 'lino', tablecloth });
  });
  it('recuerda nuevas elecciones y valida colores propios sin cambiar el modelo', () => {
    for (const id of ['crema', 'blanco', 'color:#a1b2c3']) expect(sanitizeProject({ ...projectFromTemplate('clasica'), set: id })?.set).toBe(id);
    expect(resolveScenario('color:#a1b2c3')).toEqual({ color: '#a1b2c3', surface: 'papel' });
    expect(resolveScenario('color:rojo')).toBeUndefined();
    expect(photoScenario('rosa', '#123456', 'liso')).toMatchObject({ color: '#e9c6c2', surface: 'liso' });
    for (const id of ['ventana', 'mantel-rosa', 'mantel-azul', 'mantel-rayas']) expect(photoScenario(id, '#123456', 'liso')).toEqual(resolveScenario(id));
  });
});
