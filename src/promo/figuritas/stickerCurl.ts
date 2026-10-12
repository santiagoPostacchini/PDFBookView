/** Curvatura cilíndrica con longitud conservada; el primer borde toca antes que el resto. */
export function curlSticker(base: Float32Array, output: Float32Array, width: number, angle: number): void {
  if (base.length !== output.length || width <= 0) throw new RangeError('Malla de figurita inválida');
  if (Math.abs(angle) < 1e-6) { output.set(base); return; }
  const radius = width / angle;
  for (let i = 0; i < base.length; i += 3) {
    const turn = (base[i] + width / 2) / radius;
    output[i] = -width / 2 + radius * Math.sin(turn);
    output[i + 1] = base[i + 1];
    output[i + 2] = base[i + 2] + radius * (1 - Math.cos(turn));
  }
}
