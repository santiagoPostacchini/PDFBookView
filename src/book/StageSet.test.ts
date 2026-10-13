import { afterEach, describe, expect, it, vi } from 'vitest';
import { Color, Group, Mesh, Scene } from 'three';
import { StageSet } from './StageSet';
import { LIGHTING_PRESETS } from './Stage';

afterEach(() => vi.unstubAllGlobals());
describe('fondo y mesa en el render', () => {
  it('usa el fondo exacto y aplica el mantel solo con mesa, incluso al alternarla', () => {
    const context = {
      fillRect: vi.fn(), putImageData: vi.fn(),
      getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    };
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
    const group = new Group();
    const scene = new Scene();
    const set = new StageSet(group);
    const floor = group.children[0] as Mesh;
    const table = group.children[1] as Mesh;
    const spec = { color: '#123456', surface: 'papel' as const, cloth: { color: '#abcdef', surface: 'lino' as const, tablecloth: 'vichy-rosa' as const } };
    set.apply(scene, { ...spec, table: true }, LIGHTING_PRESETS[0]);
    expect((scene.background as Color).getHexString()).toBe('123456');
    expect(scene.fog?.color.getHexString()).toBe('123456');
    expect(table.visible).toBe(true);
    expect(floor.material).toMatchObject({ color: new Color('#abcdef') });
    const material = floor.material as import('three').MeshStandardMaterial;
    expect(material.map).not.toBeNull();
    set.apply(scene, { ...spec, table: false }, LIGHTING_PRESETS[0]);
    expect(table.visible).toBe(false);
    expect(material.color.getHexString()).toBe('123456');
    expect(material.map).toBeNull();
    set.apply(scene, { ...spec, table: true }, LIGHTING_PRESETS[0]);
    expect(material.map).not.toBeNull();
    set.apply(scene, { color: '#ffffff', surface: 'liso', table: true }, LIGHTING_PRESETS[0]);
    expect(material.color.getHexString()).toBe('ffffff');
    set.dispose();
  });
});
