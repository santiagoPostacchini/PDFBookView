import type { TextItem } from './model';
import type { CamPose } from '../studio/framing';
import type { BookEngine, Director } from '../book/BookEngine';
import { timelineSet } from './timelineSet';
import { pagesToPreload, type Timeline } from './compile';
import { drawOverlay, loadTextFonts, overlayTheme, type OverlayTheme } from './overlay';
import { TimelinePlayer } from './TimelinePlayer';
import type { FiguritasImages } from './figuritas/assets';

const FPS = 30;

/** Margen del cuadro en el editor de video: abajo queda el guion de escenas. */
export const VIDEO_FRAME_MARGINS = { top: 108, bottom: 168, side: 28 };
const frameMargins = () => ({ ...VIDEO_FRAME_MARGINS, top: document.documentElement.dataset.topbarHidden === 'true' ? 24 : VIDEO_FRAME_MARGINS.top });

/**
 * Vista previa del video en el visor 3D: muestra cualquier instante (al tocar
 * una escena del guion) o reproduce en tiempo real, con los textos dibujados en
 * la capa 2D del motor. En pausa permite editar la cámara de la toma; durante
 * la reproducción la cámara sigue exclusivamente el guion.
 */
export class VideoPreview {
  /** Instante mostrado (o reproducido), en segundos. */
  time = 0;
  playing = false;
  /** Guías de lo que tapa la interfaz de Reels/TikTok (sólo en la vista previa). */
  safeZones = false;
  /** Texto tenue solo para edición; recordTimeline nunca usa este canal. */
  editingText: TextItem | null = null;
  private ghost: HTMLCanvasElement | null = null;
  onTick?: (time: number) => void;
  onStop?: () => void;
  onCameraEdit?: (sceneId: number, pose: CamPose) => void;

  private timeline: Timeline | null = null;
  private player: TimelinePlayer | null = null;
  private theme: OverlayTheme = overlayTheme('#dcc6a8');
  private preloadTimer = 0;
  private disposed = false;
  private fontsReady: Timeline | null = null;
  private fontGeneration = 0;
  private readonly fontsChanged = () => {
    if (this.timeline) this.setTimeline(this.timeline);
  };
  private readonly updateFrame = () => {
    if (this.timeline) this.engine.setFrameAspect(this.timeline.aspect, frameMargins());
  };

  constructor(private readonly engine: BookEngine, private readonly images?: FiguritasImages) {
    window.addEventListener('pdf-book-view.topbar', this.updateFrame);
    window.addEventListener('pdf-book-view.fonts', this.fontsChanged);
    engine.setInteractive(false);
    engine.setCameraControls(true);
    engine.onCameraEdit = (pose) => {
      const scene = this.timeline?.scenes.find((s) => this.time < s.end) ?? this.timeline?.scenes.at(-1);
      if (scene && !this.playing && !this.disposed) this.onCameraEdit?.(scene.index, pose);
    };
    engine.setOverlay((ctx) => this.paint(ctx));
  }

  get current(): Timeline | null {
    return this.timeline;
  }

  /** Nueva línea de tiempo (después de cada edición); vuelve a mostrar `at` (o el instante actual). */
  setTimeline(timeline: Timeline, at = this.time): void {
    if (this.disposed) return;
    const previous = this.timeline;
    if (this.playing) this.stop();
    this.timeline = timeline;
    const set = timelineSet(timeline);
    if (previous?.set !== timeline.set || previous?.cloth !== timeline.cloth || previous?.coverColor !== timeline.coverColor || previous?.windowShadow !== timeline.windowShadow || previous?.table !== timeline.table || previous?.shows !== timeline.shows) this.engine.setSet(set);
    if (previous?.lighting !== timeline.lighting) this.engine.setLighting(timeline.lighting);
    if (previous?.aspect !== timeline.aspect) this.engine.setFrameAspect(timeline.aspect, frameMargins());
    this.theme = overlayTheme(set.color);
    this.fontsReady = null;
    const generation = ++this.fontGeneration;
    loadTextFonts(timeline).then(() => { if (this.timeline === timeline && generation === this.fontGeneration && !this.disposed) { this.fontsReady = timeline; this.engine.invalidate(); } });
    this.seek(at);
    this.schedulePreload();
  }

  /** Muestra el instante t (simula los giros de hojas desde el principio: tienen estado). */
  seek(t: number): void {
    const timeline = this.timeline;
    if (!timeline || this.disposed) return;
    if (this.playing) this.stop();
    this.engine.setFov(timeline.fov);
    this.player?.dispose();
    const player = new TimelinePlayer(this.engine, timeline, this.images);
    player.reset();
    const frames = Math.round(Math.max(0, Math.min(timeline.duration, t)) * FPS);
    for (let i = 0; i < frames; i++) player.step(1 / FPS);
    this.player = player;
    this.time = player.time;
    this.engine.invalidate();
  }

  /** Reproduce desde `from` hasta `until` o el final (también se puede detener). */
  play(from = 0, until?: number): void {
    const timeline = this.timeline;
    if (!timeline || this.disposed) return;
    this.seek(from >= timeline.duration - 0.1 ? 0 : from);
    const player = this.player!;
    const end = Math.max(player.time, Math.min(timeline.duration, until ?? timeline.duration));
    const director: Director = {
      step: (dt) => {
        const running = player.step(Math.min(dt, Math.max(0, end - player.time)));
        this.time = player.time;
        this.onTick?.(this.time);
        return running && player.time < end;
      },
    };
    this.playing = true;
    this.engine.setCameraControls(false);
    this.engine.play(
      director,
      () => {
        this.playing = false;
        this.engine.setCameraControls(true);
        this.onStop?.();
      },
      timeline.fov,
    );
  }

  stop(): void {
    if (this.playing) this.engine.stopDirector();
  }

  setSafeZones(on: boolean): void {
    this.safeZones = on;
    this.engine.invalidate();
  }

  dispose(): void {
    this.stop();
    this.player?.dispose();
    this.disposed = true;
    window.removeEventListener('pdf-book-view.topbar', this.updateFrame);
    window.removeEventListener('pdf-book-view.fonts', this.fontsChanged);
    window.clearTimeout(this.preloadTimer);
    this.engine.setOverlay(null);
    this.engine.onCameraEdit = undefined;
    this.engine.setInteractive(true);
    this.engine.setSet(null);
    this.engine.unpinPages();
  }

  /** Páginas que aparecen en cámara, en alta (con un respiro para no rasterizar en cada tecla). */
  private schedulePreload(): void {
    window.clearTimeout(this.preloadTimer);
    this.preloadTimer = window.setTimeout(() => {
      const book = this.engine.currentBook;
      if (this.timeline && book && !this.disposed) void this.engine.preloadPages(pagesToPreload(this.timeline, book.pageCount));
    }, 400);
  }

  private paint(ctx: CanvasRenderingContext2D): void {
    const timeline = this.timeline;
    if (!timeline) return;
    if (this.fontsReady === timeline) drawOverlay(ctx, timeline, this.time, this.theme);
    const item = this.editingText;
    if (this.fontsReady === timeline && !this.playing && item && (this.time < item.start || this.time > Math.min(timeline.duration, item.start + item.duration))) {
      this.ghost ??= document.createElement('canvas');
      this.ghost.width = ctx.canvas.width; this.ghost.height = ctx.canvas.height;
      drawOverlay(this.ghost.getContext('2d')!, { ...timeline, cues: [{ ...item, start: 0, end: timeline.duration, animation: 'ninguna' }] }, this.time, this.theme);
      ctx.save(); ctx.globalAlpha = 0.3; ctx.drawImage(this.ghost, 0, 0); ctx.restore();
    }
    if (this.safeZones && timeline.aspect < 0.7) drawSafeZones(ctx);
  }
}

/** Zonas que tapa la interfaz de Reels/TikTok en 9:16: arriba, la columna de botones y el pie. */
function drawSafeZones(ctx: CanvasRenderingContext2D): void {
  const { width: w, height: h } = ctx.canvas;
  ctx.save();
  ctx.fillStyle = 'rgba(220, 60, 60, 0.22)';
  ctx.fillRect(0, 0, w, h * 0.13);
  ctx.fillRect(0, h * 0.75, w, h * 0.25);
  ctx.fillRect(w * 0.86, h * 0.4, w * 0.14, h * 0.35);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.font = `600 ${Math.round(h * 0.016)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('Lo tapa la interfaz', w / 2, h * 0.075);
  ctx.fillText('Usuario y descripción', w / 2, h * 0.88);
  ctx.restore();
}
