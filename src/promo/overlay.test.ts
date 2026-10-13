import { describe, expect, it } from 'vitest';
import { cueMotion, layoutCue } from './overlay';
import type { OverlayCue } from './compile';
const cue: OverlayCue = { id: 'a', text: 'uno dos tres', start: 1, end: 4, x: 0.5, y: 0.5, size: 0.1, color: 'auto', font: 'builtin:clasica', animation: 'subir' };
const measure = (s: string) => s.length * 10;
describe('layoutCue', () => {
  it('ajusta palabras, conserva saltos manuales y centra la caja', () => {
    const l = layoutCue(measure, { ...cue, text: 'uno dos tres\n\nfin' }, 100, 200);
    expect(l.lines).toEqual(['uno dos', 'tres', '', 'fin']);
    expect(l.size).toBe(20);
    expect(l.box).toEqual({ x: 15, y: 57, width: 70, height: 86 });
  });
  it('alinea la caja respecto del ancla', () => {
    expect(layoutCue(measure, { ...cue, text: 'abc', align: 'izquierda' }, 100, 200).box.x).toBe(50);
    expect(layoutCue(measure, { ...cue, text: 'abc', align: 'derecha' }, 100, 200).box.x).toBe(20);
  });
  it('parte palabras largas y pasa el CSS al medidor', () => {
    const l = layoutCue((s, css) => { expect(css).toContain('700 20px'); return measure(s); }, { ...cue, bold: true, text: 'abcdefghijkl' }, 100, 200);
    expect(l.lines).toEqual(['abcdefgh', 'ijkl']);
  });
});
describe('cueMotion', () => {
  it('entra con easeOut cúbico y sale con fundido', () => {
    expect(cueMotion(cue, 1, 6, 200)).toEqual({ alpha: 0, dy: 3 });
    const m = cueMotion(cue, 1.35, 6, 200);
    expect(m.alpha).toBeCloseTo(0.875); expect(m.dy).toBeCloseTo(0.375);
    expect(cueMotion(cue, 3.775, 6, 200).alpha).toBeCloseTo(0.125);
    expect(cueMotion(cue, 4, 6, 200).alpha).toBe(0);
  });
  it('apertura visible y cierre sin salida', () => {
    expect(cueMotion({ ...cue, start: 0 }, 0, 6, 200)).toEqual({ alpha: 1, dy: 0 });
    expect(cueMotion(cue, 4, 4, 200)).toEqual({ alpha: 1, dy: 0 });
  });
  it('fundido no desplaza y ninguna corta en los límites', () => {
    expect(cueMotion({ ...cue, animation: 'fundido' }, 1.35, 6, 200).dy).toBe(0);
    expect(cueMotion({ ...cue, animation: 'ninguna' }, 1, 6, 200).alpha).toBe(1);
    expect(cueMotion(cue, 0.9, 6, 200).alpha).toBe(0);
    expect(cueMotion(cue, 4.1, 6, 200).alpha).toBe(0);
  });
});
