import { describe, expect, it } from 'vitest';
import { readTopbarPrefs, topbarIsHidden, updateTopbarPrefs, TOPBAR_KEYS } from './topbarPrefs';

describe('preferencias de la barra', () => {
  it('muestra Foto y lectura, oculta Video y restaura al cerrar el Estudio', () => {
    const prefs = readTopbarPrefs({ getItem: () => null });
    expect(topbarIsHidden(prefs, true, 'foto')).toBe(false);
    expect(topbarIsHidden(prefs, true, 'video')).toBe(true);
    expect(topbarIsHidden(prefs, false, 'video')).toBe(false);
  });
  it('recuerda mostrar Video sin cambiar la preferencia general y viceversa', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    let prefs = updateTopbarPrefs(readTopbarPrefs(storage), true, 'video', false, storage);
    prefs = updateTopbarPrefs(prefs, true, 'foto', true, storage);
    expect(topbarIsHidden(prefs, true, 'video')).toBe(false);
    expect(topbarIsHidden(prefs, false, 'video')).toBe(true);
    expect(readTopbarPrefs(storage)).toEqual(prefs);
    prefs = updateTopbarPrefs(prefs, false, 'video', false, storage);
    expect(values.get(TOPBAR_KEYS.general)).toBe('false');
    expect(prefs.video).toBe(false);
  });
  it('tolera almacenamiento bloqueado y valores inválidos', () => {
    const blocked = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); } };
    const prefs = readTopbarPrefs(blocked);
    expect(prefs).toEqual({ general: false, video: true });
    expect(updateTopbarPrefs(prefs, true, 'video', false, blocked).video).toBe(false);
    expect(readTopbarPrefs({ getItem: () => 'inválido' })).toEqual(prefs);
  });
});
