import type { BookEngine, Director } from '../book/BookEngine';
import { sampleScript, type PromoScript } from './promoScript';

/**
 * Ejecuta un guion sobre el motor: dispara los giros de hojas a su tiempo,
 * mueve la cámara y aplica los efectos. El mismo reproductor sirve para la
 * vista previa en tiempo real y para la exportación cuadro a cuadro.
 */
export class PromoPlayer implements Director {
  time = 0;
  private nextAction = 0;

  constructor(
    private readonly engine: BookEngine,
    readonly script: PromoScript,
  ) {}

  /** Libro cerrado, t = 0. */
  reset(): void {
    this.time = 0;
    this.nextAction = 0;
    this.engine.currentBook?.jumpTo(0);
    this.apply();
  }

  step(dt: number): boolean {
    const book = this.engine.currentBook;
    if (!book) return false;
    this.time = Math.min(this.script.duration, this.time + dt);
    const { actions } = this.script;
    while (this.nextAction < actions.length && actions[this.nextAction].at <= this.time) {
      const action = actions[this.nextAction++];
      book.goToSpread(action.spread, action.speed);
    }
    book.update(dt);
    this.apply();
    return this.time < this.script.duration;
  }

  private apply(): void {
    const s = sampleScript(this.script, this.time);
    this.engine.applyPose(s.pose);
    this.engine.setLook({
      aperture: s.aperture,
      fade: s.fade,
      flash: s.flash,
      sweep: s.sweep,
      sweepStrength: s.sweepStrength,
      vignette: this.script.vignette,
      grain: this.script.grain,
    });
  }
}
