import { posePosition, type CamPose } from './framing';

/**
 * Recorrido de cámara continuo: una curva suave (Catmull-Rom centrípeta, sin
 * lazos ni picos) que pasa por todos los ángulos, recorrida por longitud de arco
 * con una velocidad que varía suavemente y nunca llega a cero. Así la cámara no
 * frena antes de cambiar de ángulo: los cambios son parte del mismo movimiento.
 */

export interface PathKey {
  t: number;
  pose: CamPose;
  aperture: number;
}

type Vec = number[];

const channels = (k: PathKey): Vec => [k.pose.azimuth, k.pose.elevation, Math.log(k.pose.distance), ...k.pose.target, k.aperture];

const toPose = (v: Vec): { pose: CamPose; aperture: number } => ({
  pose: {
    azimuth: v[0],
    elevation: Math.max(5, Math.min(86, v[1])),
    distance: Math.exp(v[2]),
    target: [v[3], Math.max(0, v[4]), v[5]],
  },
  aperture: Math.max(0, v[6]),
});

/** Punto del mundo que "se mueve" en pantalla: cámara + objetivo. */
const worldPoint = (v: Vec): Vec => {
  const { pose } = toPose(v);
  return [...posePosition(pose), ...pose.target];
};

const dist = (a: Vec, b: Vec) => Math.hypot(...a.map((x, i) => x - b[i]));
const lerp = (a: Vec, b: Vec, t0: number, t1: number, t: number): Vec => {
  const w = t1 - t0 < 1e-9 ? 0 : (t - t0) / (t1 - t0);
  return a.map((x, i) => x + (b[i] - x) * w);
};

const SAMPLES_PER_SPAN = 48;

export class CameraPath {
  readonly duration: number;
  private readonly points: Vec[];
  /** Nudos centrípetos de la curva geométrica (uno por punto, más los fantasmas). */
  private readonly knots: number[];
  /** Tabla (parámetro u global, longitud acumulada). */
  private readonly table: { u: number; len: number }[] = [];
  /** Tiempos (ya redistribuidos) y longitudes en cada punto de paso. */
  readonly times: number[];
  private readonly lengths: number[];
  private readonly slopes: number[];

  /**
   * @param keys puntos de paso con su tiempo "de guion".
   * @param evenness 0 = respeta los tiempos del guion, 1 = velocidad constante.
   */
  constructor(keys: PathKey[], duration: number, evenness = 0.8) {
    this.duration = duration;
    const pts = keys.map(channels);
    // Puntos fantasma en los extremos para que la curva arranque y termine con velocidad.
    const first = pts[0].map((x, i) => 2 * x - pts[1][i]);
    const last = pts[pts.length - 1].map((x, i) => 2 * x - pts[pts.length - 2][i]);
    this.points = [first, ...pts, last];
    this.knots = [0];
    for (let i = 1; i < this.points.length; i++) {
      const d = dist(worldPoint(this.points[i - 1]), worldPoint(this.points[i]));
      this.knots.push(this.knots[i - 1] + Math.max(1e-3, Math.sqrt(d)));
    }

    // Tabla de longitud de arco (en el mundo) a lo largo de los tramos reales.
    const spans = keys.length - 1;
    let len = 0;
    let prev = worldPoint(this.evalSpan(1, 0));
    this.table.push({ u: 0, len: 0 });
    const keyLengths = [0];
    for (let s = 0; s < spans; s++) {
      for (let j = 1; j <= SAMPLES_PER_SPAN; j++) {
        const f = j / SAMPLES_PER_SPAN;
        const p = worldPoint(this.evalSpan(s + 1, f));
        len += dist(prev, p);
        prev = p;
        this.table.push({ u: s + f, len });
      }
      keyLengths.push(len);
    }
    this.lengths = keyLengths;

    // Tiempos: mezcla entre los del guion y los de velocidad constante.
    const total = Math.max(1e-6, len);
    this.times = keys.map((k, i) => (1 - evenness) * k.t + evenness * (duration * keyLengths[i]) / total);
    this.times[0] = 0;
    this.times[this.times.length - 1] = duration;

    // Pendientes (velocidad media por tramo) y tangentes monótonas (nunca negativas ni nulas).
    const seg = keys.slice(1).map((_, i) => (keyLengths[i + 1] - keyLengths[i]) / Math.max(1e-6, this.times[i + 1] - this.times[i]));
    this.slopes = keys.map((_, i) => {
      if (i === 0) return seg[0];
      if (i === keys.length - 1) return seg[seg.length - 1];
      const avg = (seg[i - 1] + seg[i]) / 2;
      return Math.min(avg, 3 * Math.min(seg[i - 1], seg[i]));
    });
  }

  /** Reubica un instante del guion original en la línea de tiempo redistribuida. */
  warp(originalKeys: PathKey[], t: number): number {
    const k = originalKeys;
    if (t <= k[0].t) return this.times[0];
    for (let i = 1; i < k.length; i++) {
      if (t <= k[i].t) return this.times[i - 1] + ((t - k[i - 1].t) / Math.max(1e-6, k[i].t - k[i - 1].t)) * (this.times[i] - this.times[i - 1]);
    }
    return this.duration;
  }

  sample(t: number): { pose: CamPose; aperture: number } {
    const time = Math.max(0, Math.min(this.duration, t));
    // 1) tiempo → longitud recorrida (Hermite monótona entre puntos de paso).
    let i = 0;
    while (i < this.times.length - 2 && time > this.times[i + 1]) i++;
    const h = Math.max(1e-6, this.times[i + 1] - this.times[i]);
    const x = (time - this.times[i]) / h;
    const x2 = x * x;
    const x3 = x2 * x;
    const length =
      (2 * x3 - 3 * x2 + 1) * this.lengths[i] +
      (x3 - 2 * x2 + x) * h * this.slopes[i] +
      (-2 * x3 + 3 * x2) * this.lengths[i + 1] +
      (x3 - x2) * h * this.slopes[i + 1];
    // 2) longitud → parámetro de la curva (búsqueda en la tabla).
    const table = this.table;
    let lo = 0;
    let hi = table.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (table[mid].len < length) lo = mid;
      else hi = mid;
    }
    const a = table[lo];
    const b = table[hi];
    const u = b.len - a.len < 1e-9 ? a.u : a.u + ((length - a.len) / (b.len - a.len)) * (b.u - a.u);
    const span = Math.min(Math.floor(u), this.lengths.length - 2);
    return toPose(this.evalSpan(span + 1, u - span));
  }

  /** Catmull-Rom centrípeta (Barry–Goldman) entre points[s] y points[s+1], f ∈ [0,1]. */
  private evalSpan(s: number, f: number): Vec {
    const [p0, p1, p2, p3] = [this.points[s - 1], this.points[s], this.points[s + 1], this.points[s + 2]];
    const [t0, t1, t2, t3] = [this.knots[s - 1], this.knots[s], this.knots[s + 1], this.knots[s + 2]];
    const t = t1 + (t2 - t1) * f;
    const a1 = lerp(p0, p1, t0, t1, t);
    const a2 = lerp(p1, p2, t1, t2, t);
    const a3 = lerp(p2, p3, t2, t3, t);
    const b1 = lerp(a1, a2, t0, t2, t);
    const b2 = lerp(a2, a3, t1, t3, t);
    return lerp(b1, b2, t1, t2, t);
  }
}
