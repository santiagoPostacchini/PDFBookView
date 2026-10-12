import { expect, it } from 'vitest';
import { findBoxes } from './sheet';

it('separa cajas verticales y horizontales, ignorando blanco, transparencia y ruido', () => {
  const width = 100, height = 100;
  const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  const paint = (x: number, y: number, w: number, h: number, alpha = 255) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      pixels.set([30, 40, 50, alpha], (j * width + i) * 4);
    }
  };
  paint(5, 5, 20, 40); paint(40, 5, 40, 20); paint(5, 60, 25, 25, 0); paint(90, 90, 1, 1);
  expect(findBoxes(pixels, width, height, 10)).toEqual([
    { x: 5, y: 5, width: 20, height: 40 }, { x: 40, y: 5, width: 40, height: 20 },
  ]);
});
