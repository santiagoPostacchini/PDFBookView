import { describe, expect, it } from 'vitest';
import { compileProject, sampleCamera } from './compile';
import { projectFromTemplate } from './templates';
import { sanitizeSceneCamera, sceneCameraPoints } from './sceneCamera';
import { duplicateScene, updateScene } from './editing';
import { loadDraft, newDraft, saveDraft } from './projectStorage';
const book = { leafCount: 6, pageWidth: 2, pageHeight: 3 };
const camera = { zoom: { enabled: true, from: 0, to: 0.06 }, lateral: { enabled: true, amount: 0.08, direction: 'derecha' as const } };
describe('movimiento opcional por toma', () => {
  it('permite acercamiento fijo sin activar movimientos y lo conserva al guardar', () => {
    const project = projectFromTemplate('clasica');
    const fixed = compileProject(project, book);
    const settings = { framingZoom: 0.8 };
    const timeline = compileProject(updateScene(project, 0, { camera: settings }), book);
    const a = sampleCamera(timeline, 0).pose, b = sampleCamera(timeline, timeline.scenes[0].end - 0.001).pose;
    expect(a).toEqual(b); expect(sampleCamera(fixed, 0).pose.distance / a.distance).toBeCloseTo(1.8);
    expect(sanitizeSceneCamera(settings)).toEqual(settings);
  });
  it('gira alrededor del centro sin trasladar el objetivo ni acortar el radio a mitad de toma', () => {
    const settings = { lateral: { enabled: true, amount: 0.15, direction: 'derecha' as const, orbit: true } };
    const project = updateScene(projectFromTemplate('clasica'), 2, { camera: settings });
    const timeline = compileProject(project, book), scene = timeline.scenes[2];
    const points = [0, 0.25, 0.5, 0.75, 0.999999].map((u) => sampleCamera(timeline, scene.start + u * (scene.end - scene.start)).pose);
    for (const pose of points) { expect(pose.target).toEqual(points[0].target); expect(pose.target[0]).toBe(0); expect(pose.target[2]).toBe(0); expect(pose.distance).toBeCloseTo(points[0].distance, 8); }
    expect(points.at(-1)!.azimuth - points[0].azimuth).toBeCloseTo(9, 4);
    expect(sanitizeSceneCamera(settings)).toEqual(settings);
  });
  it('muestra el título al comenzar aunque Portada esté quinta o se omitan escenas iniciales', () => {
    for (const scenes of [
      [{ kind: 'doblePagina' as const }, { kind: 'cenital' as const }, { kind: 'detalle' as const }, { kind: 'cierre' as const }, { kind: 'portada' as const }],
      [{ kind: 'figuritas' as const }, { kind: 'doblePagina' as const }, { kind: 'portada' as const }],
    ]) {
      const timeline = compileProject(projectFromTemplate('clasica', { scenes }), book);
      const titles = timeline.cues.filter((c) => c.kind === 'titulo');
      expect(titles).toHaveLength(1); expect(titles[0].start).toBe(0); expect(titles[0].end).toBe(timeline.scenes[0].end);
    }
  });
  it('mueve sólo la toma elegida entre sus dos puntos, con foco estable y sin modificar el guion', () => {
    const project = projectFromTemplate('clasica'); const fixed = compileProject(project, book);
    const changed = compileProject(updateScene(project, 2, { camera }), book);
    expect(changed.actions).toEqual(fixed.actions); expect(changed.cues).toEqual(fixed.cues);
    for (const scene of changed.scenes) {
      const a = sampleCamera(changed, scene.start); const b = sampleCamera(changed, scene.end - 0.00001);
      if (scene.index !== 2) { expect(a).toEqual(b); expect(a).toEqual(sampleCamera(fixed, scene.start)); }
      else { expect(a.pose.distance / b.pose.distance).toBeCloseTo(1.06, 4); expect(a.pose.target).not.toEqual(b.pose.target); expect(a.aperture).toBe(b.aperture); }
    }
  });
  it('acepta zoom de salida y lateral inverso; apagar conserva los ajustes y devuelve el plano fijo', () => {
    const base = sampleCamera(compileProject(projectFromTemplate('clasica'), book), 0).pose;
    const [from, to] = sceneCameraPoints(base, { zoom: { enabled: true, from: 0.1, to: 0 }, lateral: { enabled: true, amount: 0.1, direction: 'izquierda' } }, 2);
    expect(from.distance).toBeLessThan(to.distance); expect(from.target[0]).toBeGreaterThan(to.target[0]);
    expect(sceneCameraPoints(base, { zoom: { ...camera.zoom, enabled: false }, lateral: { ...camera.lateral, enabled: false } }, 2)).toEqual([base, base]);
  });
  it('duplica y guarda puntos y activación, sin compartir referencias entre escenas', () => {
    const draft = newDraft(); draft.project = updateScene(draft.project, 0, { camera });
    const duplicated = duplicateScene(draft.project, 0).project;
    expect(duplicated.scenes[1].camera).toEqual(camera); expect(duplicated.scenes[1].camera?.zoom).not.toBe(duplicated.scenes[0].camera?.zoom);
    const data = new Map<string, string>(); const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
    saveDraft('album.pdf', draft, storage); expect(loadDraft('album.pdf', storage)?.project.scenes[0].camera).toEqual(camera);
  });
  it('limita valores rotos y mantiene fijos los proyectos anteriores', () => {
    expect(sanitizeSceneCamera(undefined)).toBeUndefined();
    expect(sanitizeSceneCamera({ zoom: { enabled: true, from: NaN, to: 900 }, lateral: { enabled: 'true', amount: -50 } })).toEqual({ zoom: { enabled: true, from: 0, to: 0.1 }, lateral: { enabled: false, amount: 0, direction: 'derecha' } });
  });
});
