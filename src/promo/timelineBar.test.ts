import { describe, expect, it } from 'vitest';
import { assignLanes, dragText, newTextAt, snapTime, timeToX, xToTime } from './timelineBar';

describe('barra de tiempo', () => {
  it('ajusta a cuadros y limita los extremos', () => {
    expect(snapTime(4.5, 15)).toBe(4.5);
    expect(snapTime(2.43, 15)).toBe(73 / 30);
    expect(snapTime(-1, 15)).toBe(0);
    expect(snapTime(20, 15)).toBe(15);
    expect(snapTime(NaN, 15)).toBe(0);
    expect(snapTime(10, 2.01)).toBe(2);
  });
  it('convierte coordenadas sin salir del video', () => {
    expect(xToTime(30, 100, 15)).toBe(4.5);
    expect(timeToX(4.5, 100, 15)).toBe(30);
    expect(xToTime(-20, 100, 15)).toBe(0);
    expect(xToTime(120, 100, 15)).toBe(15);
    expect(xToTime(30, 0, 15)).toBe(0);
    expect(timeToX(30, 100, 15)).toBe(100);
    expect(timeToX(1, 100, 0)).toBe(0);
  });
  it('edita los bordes sin invertir ni acortar por debajo de medio segundo', () => {
    const item = { start: 4.5, duration: 3 };
    expect(dragText(item, 'start', 10, 15)).toEqual({ start: 7, duration: .5 });
    expect(dragText(item, 'start', -10, 15)).toEqual({ start: 0, duration: 7.5 });
    expect(dragText(item, 'end', -10, 15)).toEqual({ start: 4.5, duration: .5 });
    expect(dragText(item, 'end', 20, 15)).toEqual({ start: 4.5, duration: 10.5 });
    expect(dragText(item, 'end', .02, 15).duration).toBe(91 / 30);
  });
  it('desplaza preservando duración y recorta intervalos antiguos', () => {
    expect(dragText({ start: 4.5, duration: 3 }, 'body', 20, 15)).toEqual({ start: 12, duration: 3 });
    expect(dragText({ start: 4.5, duration: 3 }, 'body', -20, 15)).toEqual({ start: 0, duration: 3 });
    expect(dragText({ start: 14, duration: 5 }, 'body', -1, 15)).toEqual({ start: 13, duration: 1 });
  });
  it('crea en el cuadro pedido con tres segundos o el tiempo restante', () => {
    expect(newTextAt(4.5, 15)).toEqual({ start: 4.5, duration: 3 });
    expect(newTextAt(14, 15)).toEqual({ start: 14, duration: 1 });
    expect(newTextAt(15, 15)).toEqual({ start: 15, duration: 0 });
  });
});

describe('assignLanes', () => {
  it('los textos que no se superponen comparten fila y los que sí, no', () => {
    const { lanes, count } = assignLanes([
      { start: 0, duration: 2.5 }, { start: 0.2, duration: 2.5 }, { start: 12, duration: 3 }, { start: 12.5, duration: 2 },
    ]);
    expect(lanes).toEqual([0, 1, 0, 1]);
    expect(count).toBe(2);
    expect(assignLanes([]).count).toBe(1);
    expect(assignLanes([{ start: 0, duration: 2 }, { start: 2, duration: 2 }]).lanes).toEqual([0, 0]);
  });
});
