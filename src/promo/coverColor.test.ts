import { expect, it } from 'vitest';
import { extractCoverColor } from './coverColor';
it('elige el tono dominante sin que blanco, texto ni transparencia lo desplacen', () => {
  const pixels = new Uint8ClampedArray([
    255,255,255,255, 255,255,255,255, 0,0,0,255, 0,255,0,0,
    200,100,100,255, 201,101,101,255, 100,100,200,255,
  ]);
  expect(extractCoverColor(pixels)).toBe('#d68b8b');
  expect(extractCoverColor(new Uint8ClampedArray([255,255,255,255]))).toBe('#dcc6a8');
  expect(extractCoverColor(new Uint8ClampedArray())).toBe('#dcc6a8');
});
