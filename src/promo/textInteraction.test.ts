import { describe, expect, it } from 'vitest';
import { hitText, pointerPosition, scaleText, snap } from './textInteraction';
describe('interacción de textos', () => {
  it('usa el cuadro de cada formato y no los márgenes del visor', () => {
    for (const aspect of [9 / 16, 4 / 5, 1, 16 / 9]) {
      const frame = { x: 28, y: 108, width: 400 * aspect, height: 400 };
      expect(pointerPosition(28 + frame.width / 2, 308, frame)).toEqual({ x: .5, y: .5 });
      expect(pointerPosition(-100, 1000, frame)).toEqual({ x: 0, y: 1 });
    }
  });
  it('elige el último texto superpuesto y excluye los que no se pasan como visibles', () => {
    const box = { x: 10, y: 20, width: 50, height: 30 };
    expect(hitText([{ id: 'a', box }, { id: 'b', box }], 30, 30)?.id).toBe('b');
    expect(hitText([{ id: 'a', box }], 0, 0)).toBeUndefined();
  });
  it('escala proporcionalmente y respeta los límites', () => {
    expect(scaleText(.04, 50, 100)).toBe(.08);
    expect(scaleText(.04, 50, 0)).toBe(.01);
    expect(scaleText(.04, 0, 1000)).toBe(.3);
    expect(snap(-.05)).toBe(0); expect(snap(1.05)).toBe(1);
  });
});
