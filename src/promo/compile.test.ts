import { describe, expect, it } from 'vitest';
import { compileProject, pagesToPreload, sampleCamera, sceneDurations, spreadPlan } from './compile';
import { FORMATS, type FormatId } from './model';
import { projectFromTemplate, TEMPLATES } from './templates';

const shape = (leafCount: number) => ({ leafCount, pageWidth: 3 * Math.SQRT1_2, pageHeight: 3 });

const cases = TEMPLATES.flatMap((t) =>
  (Object.keys(FORMATS) as FormatId[]).flatMap((format) => [10, 15, 30].flatMap((duration) => [1, 2, 6, 40].map((leafCount) => ({ template: t.id, format, duration, leafCount })))),
);

describe('sceneDurations', () => {
  it('reparte el total según el peso y respeta el mínimo por escena', () => {
    const d = sceneDurations([1, 1, 2], 8);
    expect(d.reduce((a, b) => a + b, 0)).toBeCloseTo(8);
    expect(d[2]).toBeCloseTo(2 * d[0]);
    const tight = sceneDurations([1, 10, 10], 6);
    expect(tight[0]).toBeCloseTo(1.3);
    expect(tight.reduce((a, b) => a + b, 0)).toBeCloseTo(6);
  });

  it('el cierre dura lo suficiente para leer el llamado a la acción', () => {
    const tl = compileProject(projectFromTemplate('ritmo', { duration: 10 }), shape(6));
    const cierre = tl.scenes.at(-1)!;
    expect(cierre.end - cierre.start).toBeGreaterThanOrEqual(2.6 - 1e-9);
    expect(tl.duration - tl.cues.at(-1)!.start).toBeGreaterThanOrEqual(1.9);
  });
});

describe('spreadPlan', () => {
  it('reparte dobles páginas interiores en orden', () => {
    expect(spreadPlan(6, 4)).toEqual([1, 2, 4, 5]);
    expect(spreadPlan(40, 3)).toEqual([1, 20, 39]);
    expect(spreadPlan(2, 3)).toEqual([1, 1, 1]);
  });
});

describe('compileProject', () => {
  it.each(Object.keys(FORMATS) as FormatId[])('Figuritas %s mantiene el encuadre fijo y admite el movimiento opcional existente', (format) => {
    const book = { ...shape(6), pagePt: { width: 200, height: 300 } };
    const kit = { stickers: [{ id: 'a', number: 1, widthPt: 100, heightPt: 140 }], pack: { widthPt: 150, heightPt: 220 } };
    const scene = { kind: 'figuritas' as const, stickers: [{ id: 'a', page: 2 }] };
    const project = projectFromTemplate('figuritas', { format, scenes: [scene] });
    const fixed = compileProject(project, book, kit);
    const first = sampleCamera(fixed, 0);
    for (const t of [fixed.duration / 2, fixed.duration, 0.1, 0]) expect(sampleCamera(fixed, t)).toEqual(first);
    const animated = compileProject({ ...project, scenes: [{ ...scene, camera: { zoom: { enabled: true, from: 0, to: 0.06 } } }] }, book, kit);
    expect(sampleCamera(animated, animated.duration).pose.distance).toBeCloseTo(first.pose.distance / 1.06);
    expect(sampleCamera(animated, 0).pose.distance).toBeCloseTo(first.pose.distance);
  });

  it.each(cases)('$template $format $duration s, $leafCount hojas: escenas contiguas, acciones y textos válidos', (c) => {
    const tl = compileProject(projectFromTemplate(c.template, { format: c.format, duration: c.duration }), shape(c.leafCount));
    expect(tl.duration).toBeCloseTo(c.duration);
    expect(tl.scenes[0].start).toBe(0);
    expect(tl.scenes.at(-1)!.end).toBeCloseTo(c.duration);
    for (let i = 1; i < tl.scenes.length; i++) expect(tl.scenes[i].start).toBeCloseTo(tl.scenes[i - 1].end);
    for (const a of tl.actions) {
      expect(a.at).toBeGreaterThanOrEqual(0);
      expect(a.at).toBeLessThan(c.duration);
      expect(a.spread).toBeGreaterThanOrEqual(0);
      expect(a.spread).toBeLessThanOrEqual(c.leafCount);
    }
    for (let i = 1; i < tl.actions.length; i++) expect(tl.actions[i].at).toBeGreaterThanOrEqual(tl.actions[i - 1].at);
    for (const cue of tl.cues) {
      expect(cue.start).toBeGreaterThanOrEqual(0);
      expect(cue.end).toBeLessThanOrEqual(c.duration + 0.5);
      expect(cue.end).toBeGreaterThan(cue.start);
    }
    for (let t = 0; t <= c.duration; t += 0.25) {
      const { pose, aperture } = sampleCamera(tl, t);
      expect(Number.isFinite(pose.distance) && pose.distance > 0).toBe(true);
      expect(aperture).toBeGreaterThanOrEqual(0);
    }
  });

  it('es determinista, arranca con el producto y el título a la vista y termina cerrado', () => {
    const project = projectFromTemplate('clasica');
    const tl = compileProject(project, shape(6));
    expect(compileProject(project, shape(6))).toEqual(tl);
    // Gancho: el título aparece en el primer medio segundo (sin fundido desde negro).
    expect(tl.cues[0].kind).toBe('titulo');
    expect(tl.cues[0].start).toBeLessThan(0.5);
    expect(tl.startSpread).toBe(0);
    expect(tl.actions.at(-1)!.spread).toBe(0);
    expect(tl.cues.at(-1)).toMatchObject({ kind: 'cierre', lines: ['Pedí el tuyo', '@tu.marca'] });
  });

  it('recorre el libro hacia adelante y reparte las escenas en dobles páginas distintas', () => {
    const tl = compileProject(projectFromTemplate('clasica'), shape(6));
    const open = tl.scenes.filter((s) => s.kind !== 'portada' && s.kind !== 'cierre').map((s) => s.spread);
    for (let i = 1; i < open.length; i++) expect(open[i]).toBeGreaterThanOrEqual(open[i - 1]);
    expect(new Set(open).size).toBeGreaterThanOrEqual(3);
  });

  it('respeta la doble página elegida en una escena', () => {
    const project = projectFromTemplate('clasica');
    project.scenes = project.scenes.map((s) => (s.kind === 'detalle' ? { ...s, spread: 2 } : s));
    const tl = compileProject(project, shape(6));
    expect(tl.scenes.find((s) => s.kind === 'detalle')!.spread).toBe(2);
  });

  it('si la primera escena es una doble página, el video arranca abierto ahí (sin girar hojas en el cuadro 0)', () => {
    const project = projectFromTemplate('clasica', { scenes: [{ kind: 'doblePagina', spread: 3 }, { kind: 'cierre' }] });
    const tl = compileProject(project, shape(6));
    expect(tl.startSpread).toBe(3);
    expect(tl.actions.every((a) => a.at > 0)).toBe(true);
  });

  it.each(cases)(
    'planos fijos $template $format $duration s: cámara y foco quietos hasta cada corte',
    (c) => {
      const tl = compileProject(projectFromTemplate(c.template, { format: c.format, duration: c.duration }), shape(c.leafCount));
      expect(tl.segments).toHaveLength(tl.scenes.length);
      expect(tl.transition).toBe('corte');
      for (const segment of tl.segments) {
        const first = sampleCamera(tl, segment.start);
        for (const fraction of [0.1, 0.5, 0.9, 0.9999]) {
          expect(sampleCamera(tl, segment.start + (segment.end - segment.start) * fraction)).toEqual(first);
        }
        expect(sampleCamera(tl, segment.start)).toEqual(segment.path.sample(0));
      }
    },
  );

  it('alterna ángulos y acercamientos con cortes exactos, incluso al buscar hacia atrás', () => {
    const tl = compileProject(projectFromTemplate('clasica'), shape(6));
    const poses = tl.scenes.map((s) => sampleCamera(tl, s.start).pose);
    expect(new Set(poses.map((p) => p.elevation)).size).toBeGreaterThan(3);
    expect(new Set(poses.map((p) => p.distance.toFixed(2))).size).toBeGreaterThan(3);
    for (const scene of [...tl.scenes].reverse().slice(0, -1)) {
      expect(sampleCamera(tl, scene.start - 0.0001)).not.toEqual(sampleCamera(tl, scene.start));
    }
  });

  it('precarga las páginas que aparecen en cámara', () => {
    const tl = compileProject(projectFromTemplate('clasica'), shape(6));
    const pages = pagesToPreload(tl, 12);
    for (const s of tl.spreads) expect(pages).toEqual(expect.arrayContaining([2 * s - 1, 2 * s].filter((p) => p >= 0 && p < 12)));
  });
});

it('el encuadre libre reemplaza los planos calculados de todas las escenas', () => {
  const free = { azimuth: -18, elevation: 0, distance: 7, target: [2, -3, 1] as const };
  const project = projectFromTemplate('clasica');
  project.scenes = project.scenes.map((scene) => ({ ...scene, camera: { free, framingZoom: 1 } }));
  const timeline = compileProject(project, shape(6));
  for (const scene of timeline.scenes) {
    for (const fraction of [0.1, 0.5, 0.9]) {
      const pose = sampleCamera(timeline, scene.start + (scene.end - scene.start) * fraction).pose;
      expect(pose).toEqual(free);
    }
  }
});

it('la pose libre prevalece sobre figuritasFraming', () => {
  const free = { azimuth: 15, elevation: 38, distance: 4, target: [1, 0.5, -1] as const };
  const book = { ...shape(6), pagePt: { width: 200, height: 300 } };
  const kit = { stickers: [{ id: 'a', number: 1, widthPt: 100, heightPt: 140 }], pack: { widthPt: 150, heightPt: 220 } };
  const project = projectFromTemplate('figuritas', { scenes: [{ kind: 'figuritas', stickers: [{ id: 'a', page: 2 }], camera: { free } }] });
  const timeline = compileProject(project, book, kit);
  expect(sampleCamera(timeline, 0).pose).toEqual(free);
  expect(sampleCamera(timeline, timeline.duration / 2).pose).toEqual(free);
});
