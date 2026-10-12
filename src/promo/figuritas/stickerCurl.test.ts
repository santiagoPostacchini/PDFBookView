import { describe, expect, it } from 'vitest';
import { curlSticker } from './stickerCurl';
describe('curvatura al apoyar figuritas', () => {
  it('conserva exactamente el plano cuando termina el pegado, en ambas orientaciones', () => {
    for (const width of [1, 2]) {
      const base = new Float32Array([-width / 2, -0.5, 0.002, 0, 0.5, -0.002, width / 2, 0.5, 0.002]);
      const output = new Float32Array(base.length);
      curlSticker(base, output, width, 0.65); curlSticker(base, output, width, 0);
      expect(output).toEqual(base);
    }
  });
  it('mantiene el primer borde apoyado y levanta progresivamente el resto, sin cambiar UV ni altura', () => {
    const base = new Float32Array([-1, 0.4, 0, 0, 0.4, 0, 1, 0.4, 0]);
    const output = new Float32Array(9); curlSticker(base, output, 2, 0.65);
    expect(output[0]).toBe(-1); expect(output[2]).toBe(0);
    expect(output[5]).toBeGreaterThan(0); expect(output[8]).toBeGreaterThan(output[5]);
    expect(output[1]).toBe(base[1]); expect(output[4]).toBe(base[4]); expect(output[7]).toBe(base[7]);
    expect(base[8]).toBe(0);
  });
});
