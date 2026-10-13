/** Los tiempos editados se expresan como cuadros enteros a 30 fps. */
export const FRAME = 1 / 30;
const frames = (t: number) => Math.round((Number.isFinite(t) ? t : 0) * 30);
export function snapTime(t: number, duration: number): number {
  return Math.max(0, Math.min(Math.floor(duration * 30 + 1e-8), frames(t))) / 30;
}
export function xToTime(x: number, width: number, duration: number): number {
  return snapTime(width > 0 ? x / width * duration : 0, duration);
}
export function timeToX(t: number, width: number, duration: number): number {
  return duration > 0 ? Math.max(0, Math.min(duration, t)) / duration * Math.max(0, width) : 0;
}
export type TextDrag = 'start' | 'end' | 'body';
export function dragText(item: { start: number; duration: number }, mode: TextDrag, delta: number, total: number) {
  const limit = Math.max(0, Math.floor(total * 30 + 1e-8));
  const minimum = Math.min(15, limit);
  let start = Math.max(0, Math.min(limit - minimum, frames(item.start)));
  let end = Math.max(start + minimum, Math.min(limit, frames(item.start + item.duration)));
  const shift = frames(delta);
  if (mode === 'start') start = Math.max(0, Math.min(end - minimum, start + shift));
  if (mode === 'end') end = Math.max(start + minimum, Math.min(limit, end + shift));
  if (mode === 'body') { const length = end - start; start = Math.max(0, Math.min(limit - length, start + shift)); end = start + length; }
  return { start: start / 30, duration: (end - start) / 30 };
}
export function newTextAt(t: number, total: number) {
  const start = snapTime(t, total);
  return { start, duration: Math.min(3, snapTime(total - start, total)) };
}
