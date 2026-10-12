/** Color dominante robusto: descarta transparencia, blanco y texto casi negro. */
export function extractCoverColor(data: Uint8ClampedArray): string {
  const bins = new Map<number, { r: number; g: number; b: number; count: number }>();
  for (let i = 0; i + 3 < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (data[i + 3] < 128 || Math.min(r, g, b) > 238 || Math.max(r, g, b) < 35) continue;
    const key = (r >> 4) * 256 + (g >> 4) * 16 + (b >> 4);
    const bin = bins.get(key) ?? { r: 0, g: 0, b: 0, count: 0 };
    bin.r += r; bin.g += g; bin.b += b; bin.count++; bins.set(key, bin);
  }
  const dominant = [...bins.values()].sort((a, b) => b.count - a.count)[0];
  if (!dominant) return '#dcc6a8';
  // Un poco de blanco mantiene el escenario suave sin perder el tono de la tapa.
  return '#' + [dominant.r, dominant.g, dominant.b].map((v) => Math.round(v / dominant.count * 0.75 + 255 * 0.25).toString(16).padStart(2, '0')).join('');
}
