import { describe, expect, it } from 'vitest';
import { compileProject } from './compile';
import { addScene, applyTemplate, duplicateScene, moveScene, pacingAdvice, placeScene, removeScene, sceneAt, sceneFocusTime, spreadLabel, updateScene } from './editing';
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
    expect(chosen.scenes[2]).toEqual({ kind: 'doblePagina', caption: 'Tus fotos, tu historia', spread: 3, length: 'larga' });
    const auto = updateScene(chosen, 2, { spread: undefined, caption: '', length: 'normal' });
    expect(auto.scenes[2]).toEqual({ kind: 'doblePagina' });
  });

  it('cambiar de estilo trae su look; el guion sólo si no se había tocado; los textos se conservan', () => {
    const p = projectFromTemplate('clasica');
    p.texts.handle = '@mi.marca';
    const ritmo = applyTemplate(p, 'ritmo');
    const t = templateById('ritmo');
    expect(ritmo).toMatchObject({ template: 'ritmo', set: t.set, lighting: t.lighting, typography: t.typography, duration: t.duration });
    expect(ritmo.scenes).toEqual(t.scenes);
    expect(ritmo.texts.handle).toBe('@mi.marca');

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
    const titulo = tl.cues.find((c) => c.kind === 'titulo')!;
    expect(sceneFocusTime(tl, 0)).toBeGreaterThan(titulo.start + 0.8);
    const cierre = tl.cues.find((c) => c.kind === 'cierre')!;
    expect(sceneFocusTime(tl, tl.scenes.at(-1)!.index)).toBeGreaterThan(cierre.start + 1.05);
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
