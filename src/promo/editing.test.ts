import { describe, expect, it } from 'vitest';
import { compileProject } from './compile';
import { addText, updateText, removeText, duplicateText, addScene, applyTemplate, duplicateScene, moveScene, pacingAdvice, placeScene, removeScene, sceneAt, sceneFocusTime, spreadLabel, updateScene } from './editing';
import { projectFromTemplate, templateById } from './templates';

const shape = { leafCount: 6, pageWidth: 3 * Math.SQRT1_2, pageHeight: 3 };

describe('edición del guion', () => {
  it('agrega escenas después de la elegida y antes del cierre si va al final', () => {
    const p = projectFromTemplate('clasica');
    const middle = addScene(p, 'detalle', 1);
    expect(middle.index).toBe(2);
    expect(middle.project.scenes[2]).toEqual({ kind: 'detalle' });
    const end = addScene(p, 'hojeo', p.scenes.length - 1);
    expect(end.project.scenes.at(-1)!.kind).toBe('cierre');
    expect(end.project.scenes.at(-2)).toEqual({ kind: 'hojeo' });
    expect(p.scenes).toHaveLength(7); // el original no cambia
  });

  it('mueve y quita escenas sin salirse de los bordes', () => {
    const p = projectFromTemplate('clasica');
    expect(moveScene(p, 0, -1)).toEqual({ project: p, index: 0 });
    const moved = moveScene(p, 2, 1);
    expect(moved.index).toBe(3);
    expect(moved.project.scenes[3].kind).toBe('doblePagina');
    const removed = removeScene(p, 6);
    expect(removed.project.scenes).toHaveLength(6);
    expect(removed.index).toBe(5);
    const single = { ...p, scenes: [{ kind: 'portada' as const }] };
    expect(removeScene(single, 0).project.scenes).toHaveLength(1);
  });

  it('duplica una escena al lado y la arrastra a otro lugar', () => {
    const p = projectFromTemplate('clasica');
    const dup = duplicateScene(p, 2);
    expect(dup.index).toBe(3);
    expect(dup.project.scenes[3]).toEqual(p.scenes[2]);
    expect(dup.project.scenes).toHaveLength(8);
    const dragged = placeScene(p, 4, 1);
    expect(dragged.index).toBe(1);
    expect(dragged.project.scenes.map((s) => s.kind)).toEqual(['portada', 'detalle', 'apertura', 'doblePagina', 'hojeo', 'cenital', 'cierre']);
    expect(placeScene(p, 1, 9)).toEqual({ project: p, index: 1 });
  });

  it('actualiza una escena y deja el JSON limpio (automática = sin doble página)', () => {
    const p = projectFromTemplate('clasica');
    const chosen = updateScene(p, 2, { spread: 3, length: 'larga' });
    expect(chosen.scenes[2]).toEqual({ kind: 'doblePagina', spread: 3, length: 'larga' });
    const auto = updateScene(chosen, 2, { spread: undefined, length: 'normal' });
    expect(auto.scenes[2]).toEqual({ kind: 'doblePagina' });
  });

  it('el estilo Figuritas agrega su escena aunque el guion ya estuviera editado', () => {
    const edited = removeScene(projectFromTemplate('clasica'), 4).project;
    const result = applyTemplate(edited, 'figuritas');
    expect(result.scenes.filter((s) => s.kind === 'figuritas')).toHaveLength(1);
    expect(result.scenes.at(-1)?.kind).toBe('cierre');
    expect(result.scenes.length).toBe(edited.scenes.length + 1);
    expect(applyTemplate(result, 'figuritas').scenes).toEqual(result.scenes);
    expect(applyTemplate(projectFromTemplate('clasica'), 'figuritas').scenes).toEqual(templateById('figuritas').scenes);
  });

  it('cambiar de estilo trae su look; el guion sólo si no se había tocado; los textos se conservan', () => {
    const p = projectFromTemplate('clasica');
    p.textItems.find(t => t.id === 'handle')!.text = '@mi.marca';
    const ritmo = applyTemplate(p, 'ritmo');
    const t = templateById('ritmo');
    expect(ritmo).toMatchObject({ template: 'ritmo', set: t.set, lighting: t.lighting, duration: t.duration });
    expect(ritmo.scenes).toEqual(t.scenes);
    expect(ritmo.textItems.find(t => t.id === 'handle')!.text).toBe('@mi.marca');

    const edited = removeScene(p, 4).project;
    const kept = applyTemplate({ ...edited, duration: 20 }, 'minimal');
    expect(kept.scenes).toEqual(edited.scenes);
    expect(kept.duration).toBe(20);
  });
});

describe('vista previa', () => {
  it('el instante de cada escena cae dentro de ella, con el título y el cierre ya visibles', () => {
    const tl = compileProject(projectFromTemplate('clasica'), shape);
    for (const scene of tl.scenes) {
      const t = sceneFocusTime(tl, scene.index);
      expect(t).toBeGreaterThan(scene.start);
      expect(t).toBeLessThan(scene.end);
      expect(sceneAt(tl, t)).toBe(scene.index);
    }

  });

  it('avisa cuando las escenas quedan demasiado cortas', () => {
    const p = projectFromTemplate('clasica');
    expect(pacingAdvice(compileProject(p, shape))).toBeNull();
    let crowded = p;
    for (let i = 0; i < 5; i++) crowded = addScene(crowded, 'detalle', 2).project;
    expect(pacingAdvice(compileProject({ ...crowded, duration: 10 }, shape))).toMatch(/12 escenas en 10 s/);
  });

  it('nombra las páginas de una doble página como en el libro', () => {
    expect(spreadLabel(1, 12)).toBe('Págs. 2–3');
    expect(spreadLabel(6, 12)).toBe('Pág. 12');
  });
});

it('cambiar plantilla conserva el mantel y la mesa elegidos', () => {
  const p = projectFromTemplate('clasica', { cloth: 'color:#123456', table: false });
  expect(applyTemplate(p, 'minimal')).toMatchObject({ cloth: 'color:#123456', table: false });
});

it('edita textos sin mutar, sanea y conserva ids unicos y el limite', () => {
  const p = projectFromTemplate('clasica');
  const added = addText(p, { id: 'title', text: 'x'.repeat(200), size: 4, start: -3, font: 'user:mi-fuente' });
  expect(added.textItems.at(-1)).toMatchObject({ id: 'title-2', size: 0.3, start: 0, font: 'user:mi-fuente' });
  expect(added.textItems.at(-1)!.text).toHaveLength(120);
  const updated = updateText(added, 'title-2', { duration: 0, x: 9, color: 'rojo', id: 'roto' });
  expect(updated.textItems.at(-1)).toMatchObject({ id: 'title-2', duration: 0.5, x: 1, color: 'auto' });
  const duplicated = duplicateText(updated, 'title-2');
  expect(new Set(duplicated.textItems.map(t => t.id)).size).toBe(6);
  expect(removeText(duplicated, 'title-2').textItems).toHaveLength(5);
  expect(p.textItems).toHaveLength(4);
  expect(updateText(p, 'title', { text: 'Hola ' }).textItems.find(t => t.id === 'title')!.text).toBe('Hola ');
  let full = p; for (let i = 0; i < 40; i++) full = addText(full);
  expect(full.textItems).toHaveLength(30);
  expect(applyTemplate({ ...p, textItems: [] }, 'minimal').textItems).toHaveLength(4);
});
