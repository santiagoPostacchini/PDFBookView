export interface Rect { x: number; y: number; width: number; height: number }
export const snap = (value: number) => Math.max(0, Math.min(1, value));
/** El rectángulo es el del lienzo de video, con sus márgenes ya resueltos. */
export function pointerPosition(clientX: number, clientY: number, frame: Rect) {
  return { x: snap((clientX - frame.x) / frame.width), y: snap((clientY - frame.y) / frame.height) };
}
export function hitText<T extends { id: string; box: Rect }>(items: readonly T[], x: number, y: number): T | undefined {
  return [...items].reverse().find(({ box: b }) => x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height);
}
export function scaleText(size: number, initialDistance: number, distance: number) {
  return Math.max(0.01, Math.min(0.3, size * distance / Math.max(1, initialDistance)));
}
