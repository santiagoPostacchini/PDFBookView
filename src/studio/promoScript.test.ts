import { describe, expect, it } from 'vitest';
import { buildPromoScript, pagesToPreload, pickFeaturedSpreads, sampleScript, type PromoStyle } from './promoScript';

const base = { pageWidth: 3 * Math.SQRT1_2, pageHeight: 3 };

describe('pickFeaturedSpreads', () => {
  it('reparte las dobles páginas interiores', () => {
    expect(pickFeaturedSpreads(14, 4)).toEqual([1, 5, 9, 13]);
    expect(pickFeaturedSpreads(3, 5)).toEqual([1, 2]);
    expect(pickFeaturedSpreads(1, 3)).toEqual([]);
  });
});

describe('buildPromoScript', () => {
  const styles: PromoStyle[] = ['elegante', 'dinamico', 'minimal'];
  const cases = styles.flatMap((style) =>
    [9 / 16, 1].flatMap((aspect) => [10, 15, 30].flatMap((duration) => [1, 2, 7, 40].map((leafCount) => ({ style, aspect, duration, leafCount })))),
  );

  it.each(cases)('$style $aspect $duration s, $leafCount hojas: planos contiguos y acciones válidas', (c) => {
    const script = buildPromoScript({ ...base, ...c });
    expect(script.shots[0].start).toBe(0);
    expect(script.shots.at(-1)!.end).toBeCloseTo(c.duration);
    for (let i = 1; i < script.shots.length; i++) expect(script.shots[i].start).toBeCloseTo(script.shots[i - 1].end);
    for (const a of script.actions) {
      expect(a.at).toBeGreaterThanOrEqual(0);
      expect(a.at).toBeLessThan(c.duration);
      expect(a.spread).toBeGreaterThanOrEqual(0);
      expect(a.spread).toBeLessThanOrEqual(c.leafCount);
    }
    for (let t = 0; t <= c.duration; t += 0.25) {
      const s = sampleScript(script, t);
      expect(Number.isFinite(s.pose.distance) && s.pose.distance > 0).toBe(true);
      expect(s.fade).toBeGreaterThanOrEqual(0);
      expect(s.fade).toBeLessThanOrEqual(1);
    }
  });

  it('es determinista, arranca y termina en negro y cierra el libro', () => {
    const spec = { ...base, style: 'elegante' as const, duration: 15, aspect: 9 / 16, leafCount: 7 };
    const script = buildPromoScript(spec);
    expect(buildPromoScript(spec)).toEqual(script);
    expect(sampleScript(script, 0).fade).toBe(1);
    expect(sampleScript(script, 15).fade).toBe(1);
    expect(sampleScript(script, 7.5).fade).toBe(0);
    expect(script.actions[0].spread).toBe(1);
    expect(script.actions.at(-1)!.spread).toBe(0);
  });

  it('precarga las páginas de las dobles páginas destacadas', () => {
    const script = buildPromoScript({ ...base, style: 'minimal', duration: 15, aspect: 1, leafCount: 7 });
    const pages = pagesToPreload(script, 14);
    for (const s of script.featuredSpreads) expect(pages).toEqual(expect.arrayContaining([2 * s - 1, 2 * s].filter((p) => p >= 0)));
  });
});
