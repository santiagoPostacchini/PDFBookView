import type { LeafPose } from './paperDeformer';

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

export interface FlipTuning {
  /** Duración de un giro completo (s). */
  duration: number;
  /** Amplitud de la curvatura durante el giro (rad). */
  curlAmplitude: number;
  /** Peso del tramo donde el borde adelanta (se levanta primero). */
  lead: number;
  /** Peso del tramo donde el borde queda atrás (resistencia del aire al caer). */
  lag: number;
}

export const DEFAULT_FLIP: FlipTuning = { duration: 0.95, curlAmplitude: 1.3, lead: 1.2, lag: 1.0 };

/** Animación de una hoja desde su pose actual hasta quedar apoyada en un lado. */
export class FlipTween {
  private elapsed = 0;
  private readonly from: LeafPose;
  private readonly dir: 1 | -1;
  private readonly duration: number;

  constructor(
    from: LeafPose,
    readonly toAngle: number,
    private readonly tuning: FlipTuning,
    private delay = 0,
    private readonly ease: (t: number) => number = easeInOutCubic,
    speed = 1,
  ) {
    this.from = { ...from };
    this.dir = toAngle >= from.angle ? 1 : -1;
    const span = Math.abs(toAngle - from.angle) / Math.PI;
    this.duration = (tuning.duration * (0.35 + 0.65 * span)) / speed;
  }

  get done(): boolean {
    return this.delay <= 0 && this.elapsed >= this.duration;
  }

  get started(): boolean {
    return this.delay <= 0;
  }

  /** Avanza el reloj y devuelve la pose, o null si todavía está en espera. */
  step(dt: number): LeafPose | null {
    if (this.delay > 0) {
      this.delay -= dt;
      if (this.delay > 0) return null;
      dt = -this.delay;
    }
    this.elapsed = Math.min(this.duration, this.elapsed + dt);
    const t = this.elapsed / this.duration;
    const e = this.ease(t);
    const { lead, lag, curlAmplitude } = this.tuning;
    // Arco del papel: primero el borde se levanta adelante; desde la mitad del giro
    // queda detrás (resistencia del aire) y la hoja cae en forma de "C".
    const arc = Math.sin(Math.PI * e) * (lead * (1 - e) ** 2 - lag * e);
    return {
      angle: this.from.angle + (this.toAngle - this.from.angle) * e,
      curl: this.from.curl * (1 - e) + this.dir * curlAmplitude * arc,
      twist: this.from.twist * (1 - e) ** 2,
      curlTwist: this.from.curlTwist * (1 - e) ** 2,
    };
  }
}
