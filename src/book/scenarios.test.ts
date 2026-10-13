import { describe, expect, it } from 'vitest';
import { BACKDROP_PRESETS } from './Stage';
import { SET_PRESETS, type Surface } from './StageSet';
import { legacyPhotoSwatch, migratePhotoEnvironment, migratePhotoBackdrop, photoScenario, resolveScenario, resolveCloth, SCENARIOS } from './scenarios';
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
    const colors = { arena: '#dcc6a8', lino: '#ddd3c4', salvia: '#bcc7ae', rosa: '#e9c6c2', carbon: '#3b3734', noche: '#28324c', ventana: '#e7d5b9' };
    for (const [id, color] of Object.entries(colors)) {
      expect(resolveScenario(id)?.color).toBe(color);
      expect(sanitizeProject({ ...projectFromTemplate('clasica'), set: id })?.set).toBe(id);
    }
    expect(sanitizeProject({ ...projectFromTemplate('clasica'), set: 'automatico' })?.set).toBe('automatico');
    expect(resolveScenario('ventana')).toMatchObject({ surface: 'lino', windowShadow: true });
    for (const [id, tablecloth] of [['mantel-rosa', 'vichy-rosa'], ['mantel-azul', 'vichy-azul'], ['mantel-rayas', 'rayas-salvia']]) expect(resolveCloth(id)).toMatchObject({ surface: 'lino', tablecloth });
  });
  it('recuerda nuevas elecciones y valida colores propios sin cambiar el modelo', () => {
    for (const id of ['crema', 'blanco', 'color:#a1b2c3']) expect(sanitizeProject({ ...projectFromTemplate('clasica'), set: id })?.set).toBe(id);
    expect(resolveScenario('color:#a1b2c3')).toEqual({ color: '#a1b2c3', surface: 'papel' });
    expect(resolveScenario('color:rojo')).toBeUndefined();
    expect(photoScenario('rosa', '#123456', 'liso')).toMatchObject({ color: '#e9c6c2', surface: 'liso' });
    expect(photoScenario('ventana', '#123456', 'liso')).toMatchObject({ windowShadow: true });
  });
  it('muestra el fondo anterior de Foto con su color real, aparte del catálogo', () => {
    for (const old of BACKDROP_PRESETS) {
      const swatch = legacyPhotoSwatch(migratePhotoBackdrop(old.id));
      expect(swatch?.color).toBe(old.inner);
      expect(swatch?.label).toMatch(/\(anterior\)$/);
    }
    expect(legacyPhotoSwatch('rosa')).toBeNull();
    expect(legacyPhotoSwatch('custom')).toBeNull();
    expect(legacyPhotoSwatch('foto:inexistente')).toBeNull();
  });
});

it('separa los colores propios de mantel y fondo en Foto', () => {
  expect(photoScenario('color:#123456', '#ffffff', 'papel', true, 'color:#abcdef')).toMatchObject({ color: '#123456', table: true, cloth: { color: '#abcdef' } });
  expect(migratePhotoBackdrop('rosa', 2)).toBe('rosa');
});

it('migra Foto con mantel y conserva colores anteriores y del catálogo v1', () => {
  for (const cloth of ['mantel-rosa', 'mantel-azul', 'mantel-rayas']) {
    expect(migratePhotoEnvironment({ backdrop: cloth, catalogVersion: 1 })).toEqual({ backdrop: 'carbon', cloth, table: true, catalogVersion: 2 });
  }
  expect(migratePhotoEnvironment({ backdrop: 'rosa' }).backdrop).toBe('foto:rosa');
  expect(migratePhotoEnvironment({ backdrop: 'rosa', catalogVersion: 1 }).backdrop).toBe('rosa');
  const migrated = migratePhotoEnvironment({ backdrop: 'color:#abcdef', cloth: 'color:#123456', table: false, catalogVersion: 2 });
  expect(migratePhotoEnvironment(migrated)).toEqual(migrated);
});
