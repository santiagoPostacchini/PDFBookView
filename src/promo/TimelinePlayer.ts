import type { BookEngine, Director } from '../book/BookEngine';
import { sampleCamera, type Timeline } from './compile';
import type { FiguritasImages } from './figuritas/assets';
import { ShowRigs } from './figuritas/Rig';

/**
 * Ejecuta una línea de tiempo sobre el motor: dispara los giros de hojas a su
 * tiempo, mueve la cámara y ajusta el foco. El mismo reproductor sirve para la
 * vista previa en tiempo real y para la exportación cuadro a cuadro.
 */
export class TimelinePlayer implements Director {
  time = 0;
  private nextAction = 0;
  private readonly rigs?: ShowRigs;

  constructor(
    private readonly engine: BookEngine,
    readonly timeline: Timeline,
    images?: FiguritasImages,
  ) {
    if (images) this.rigs = new ShowRigs(engine, timeline, images);
  }

  dispose(): void { this.rigs?.dispose(); }

  reset(): void {
    this.time = 0;
    this.nextAction = 0;
    this.engine.currentBook?.jumpTo(this.timeline.startSpread);
    this.apply();
  }

  step(dt: number): boolean {
    const book = this.engine.currentBook;
    if (!book) return false;
    this.time = Math.min(this.timeline.duration, this.time + dt);
    const { actions } = this.timeline;
    while (this.nextAction < actions.length && actions[this.nextAction].at <= this.time) {
      const action = actions[this.nextAction++];
      book.goToSpread(action.spread, action.speed);
    }
    book.update(dt);
    this.apply();
    return this.time < this.timeline.duration;
  }

  private apply(): void {
    this.rigs?.apply(this.time);
    const { pose, aperture } = sampleCamera(this.timeline, this.time);
    this.engine.applyPose(pose);
    const { vignette, grain, ambientOcclusion } = this.timeline.look;
    this.engine.setLook({ aperture, vignette, grain, ambientOcclusion: ambientOcclusion ?? 0, fade: 0 });
  }
}
