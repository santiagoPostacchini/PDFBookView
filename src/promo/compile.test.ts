import { describe, expect, it } from 'vitest';
import { posePosition } from '../studio/framing';
import { compileProject, pagesToPreload, sampleCamera, sceneDurations, spreadPlan, type Timeline } from './compile';
import { FORMATS, type FormatId } from './model';
import { projectFromTemplate, TEMPLATES } from './templates';

const shape = (leafCount: number) => ({ leafCount, pageWidth: 3 * Math.SQRT1_2, pageHeight: 3 });

const cases = TEMPLATES.flatMap((t) =>
  (Object.keys(FORMATS) as FormatId[]).flatMap((format) => [10, 15, 30].flatMap((duration) => [1, 2, 6, 40].map((leafCount) => ({ template: t.id, format, duration, leafCount })))),
);

/** Velocidad de la cámara (cámara + objetivo, unidades/s) cuadro a cuadro. */
function speeds(timeline: Timeline, from = 0, to = timeline.duration): number[] {
  const dt = 1 / 30;
  const at = (t: number) => {
    const { pose } = sampleCamera(timeline, t);
    return [...posePosition(pose), ...pose.target];
  };
  // Muestras estrictamente dentro de [from, to): en los cortes, el cuadro anterior es de otro plano.
  const times: number[] = [];
  for (let k = 0; from + 1e-6 + k * dt < to - 1e-6; k++) times.push(from + 1e-6 + k * dt);
  const out: number[] = [];
  for (let k = 1; k < times.length; k++) {
    const a = at(times[k - 1]);
    const b = at(times[k]);
    out.push(Math.hypot(...a.map((v, i) => b[i] - v)) / dt);
  }
  return out;
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

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

  it.each(cases.filter((c) => c.leafCount > 2 && TEMPLATES.find((t) => t.id === c.template)!.transition === 'continua'))(
    'toma continua $template $format $duration s: la cámara nunca frena ni salta',
    (c) => {
      const tl = compileProject(projectFromTemplate(c.template, { format: c.format, duration: c.duration }), shape(c.leafCount));
      const v = speeds(tl);
      const m = median(v);
      expect(Math.min(...v)).toBeGreaterThan(m * 0.12);
      expect(Math.max(...v)).toBeLessThan(m * 6);
      for (let i = 1; i < v.length; i++) expect(Math.abs(v[i] - v[i - 1])).toBeLessThan(m * 1.5 + 0.5);
    },
  );

  it.each(cases.filter((c) => c.leafCount > 2 && TEMPLATES.find((t) => t.id === c.template)!.transition === 'corte'))(
    'cortes $template $format $duration s: cada plano se mueve a velocidad pareja hasta el corte',
    (c) => {
      const tl = compileProject(projectFromTemplate(c.template, { format: c.format, duration: c.duration }), shape(c.leafCount));
      for (const segment of tl.segments) {
        const v = speeds(tl, segment.start, segment.end);
        const m = median(v);
        expect(m).toBeGreaterThan(0);
        // Sin aceleraciones ni frenadas dentro del plano: se corta en pleno movimiento.
        expect(Math.min(...v)).toBeGreaterThan(m * 0.7);
        expect(Math.max(...v)).toBeLessThan(m * 1.4);
      }
    },
  );

  it('precarga las páginas que aparecen en cámara', () => {
    const tl = compileProject(projectFromTemplate('clasica'), shape(6));
    const pages = pagesToPreload(tl, 12);
    for (const s of tl.spreads) expect(pages).toEqual(expect.arrayContaining([2 * s - 1, 2 * s].filter((p) => p >= 0 && p < 12)));
  });
});
