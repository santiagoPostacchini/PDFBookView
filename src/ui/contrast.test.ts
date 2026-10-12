/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = readFileSync(new URL('../styles.css', import.meta.url), 'utf8').split('}')[0];
const variable = (name: string) => root.match(new RegExp(`--${name}:\\s*([^;]+)`))![1];
const rgb = (color: string): number[] => color.startsWith('#')
  ? [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
  : color.match(/[\d.]+/g)!.map(Number).map((v, i) => i < 3 ? v / 255 : v);
const luminance = (color: number[]) => color.slice(0, 3).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
const contrast = (a: number[], b: number[]) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
describe('Contraste del texto de la interfaz', () => {
  for (const background of ['bg-center', 'bg-edge']) {
    const canvas = rgb(variable(background));
    const panel = rgb(variable('panel'));
    const composite = panel.slice(0, 3).map((v, i) => v * panel[3] + canvas[i] * (1 - panel[3]));
    for (const foreground of ['text', 'muted', 'accent']) {
      it(`${foreground} sobre ${background} y panel: al menos 4,5:1`, () => {
        expect(contrast(rgb(variable(foreground)), canvas)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(rgb(variable(foreground)), composite)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
