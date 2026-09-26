import {
  MathUtils,
  NeutralToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Timer,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { fitDistance, posePosition, type CamPose } from '../studio/framing';
import { Book, type BookOptions } from './Book';
import { PageInteraction } from './PageInteraction';
import { PageTextureManager } from './PageTextureManager';
import { NEUTRAL_LOOK, PostFX, type LookSettings } from './PostFX';
import { Stage, type Backdrop } from './Stage';
import type { PageImage, PageImageProvider, SpreadInfo } from './types';

export interface BookEngineEvents {
  spread: (spread: SpreadInfo | null) => void;
  thumbnail: (pageIndex: number, image: PageImage) => void;
  progress: (ready: number, total: number) => void;
}

type Listeners = { [K in keyof BookEngineEvents]: Set<BookEngineEvents[K]> };

/** Algo que anima la escena cuadro a cuadro (p. ej. un video promocional). */
export interface Director {
  /** Avanza `dt` segundos. Devuelve false cuando terminó. */
  step(dt: number): boolean;
}

export type ViewPreset = 'frontal' | 'tresCuartos' | 'cenital' | 'rasante' | 'detalle';

export const VIEW_PRESETS: { id: ViewPreset; label: string }[] = [
  { id: 'frontal', label: 'Frontal' },
  { id: 'tresCuartos', label: '3/4' },
  { id: 'cenital', label: 'Cenital' },
  { id: 'rasante', label: 'Rasante' },
  { id: 'detalle', label: 'Detalle' },
];

export interface PhotoOptions {
  /** Lado mayor de la imagen en píxeles. */
  longSide: number;
  type: 'image/png' | 'image/jpeg';
  /** Fondo transparente (sólo PNG; sin efectos de post-proceso). */
  transparent?: boolean;
}

interface ViewSnapshot {
  position: Vector3;
  target: Vector3;
  fov: number;
  spread: number;
  look: LookSettings;
}

/** Elevación de la vista por defecto (grados sobre la mesa). */
const VIEW_ELEVATION = 58;
const DEFAULT_FOV = 32;

/**
 * Motor 3D independiente del framework de UI: escena, cámara, controles,
 * bucle de render (sólo dibuja cuando algo cambia) y ciclo de vida del libro.
 * En modo estudio agrega fondo en escena, post-proceso, encuadre fijo y
 * exportación de fotos y videos.
 */
export class BookEngine {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(DEFAULT_FOV, 1, 0.05, 200);
  readonly controls: OrbitControls;
  readonly stage = new Stage();

  private book: Book | null = null;
  private textures: PageTextureManager | null = null;
  private readonly interaction: PageInteraction;
  private readonly timer = new Timer();
  private readonly resizeObserver: ResizeObserver;
  private readonly listeners: Listeners = { spread: new Set(), thumbnail: new Set(), progress: new Set() };
  private needsRender = true;
  /** El usuario movió la cámara: al redimensionar no se reencuadra solo. */
  private cameraTouched = false;
  private frameHandle = 0;
  private homeDistance = 10;
  private cameraTween: { fromPos: Vector3; toPos: Vector3; fromTarget: Vector3; toTarget: Vector3; t: number } | null = null;

  private post: PostFX | null = null;
  private studio = false;
  private frameAspect: number | null = null;
  private director: { director: Director; onEnd: () => void; snapshot: ViewSnapshot } | null = null;
  private offline = false;
  private clock = 0;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.classList.add('book-canvas');
    container.appendChild(this.renderer.domElement);

    this.scene.add(this.stage.group);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = MathUtils.degToRad(84); // no pasar por debajo de la mesa
    this.controls.minDistance = 1.5;
    this.controls.maxDistance = 60;
    this.controls.addEventListener('change', this.invalidate);
    this.controls.addEventListener('start', () => {
      this.cameraTouched = true;
      this.cameraTween = null;
    });

    this.interaction = new PageInteraction(
      this.renderer.domElement,
      this.camera,
      this.controls,
      () => (this.director || this.offline ? null : this.book),
      this.invalidate,
    );

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.placeCamera(false);
    this.frameHandle = requestAnimationFrame(this.frame);
  }

  on<K extends keyof BookEngineEvents>(event: K, listener: BookEngineEvents[K]): () => void {
    this.listeners[event].add(listener);
    return () => {
      this.listeners[event].delete(listener);
    };
  }

  /** Doble página visible (hojas pasadas a la izquierda). */
  get spreadIndex(): number {
    return this.book?.spread.index ?? 0;
  }

  get currentBook(): Book | null {
    return this.book;
  }

  /**
   * Construye un libro nuevo a partir de un proveedor de páginas (null lo quita).
   * Con `keepView` conserva la cámara (p. ej. al rearmar el mismo documento).
   */
  setBook(provider: PageImageProvider | null, options: Partial<BookOptions> & { keepView?: boolean } = {}): void {
    const { keepView = false, ...bookOptions } = options;
    this.stopDirector();
    this.textures?.dispose();
    this.book?.dispose();
    this.textures = null;
    this.book = null;

    if (provider && provider.pageCount > 0) {
      const book = new Book({ pageCount: provider.pageCount, pageAspect: provider.pageAspect, ...bookOptions });
      this.book = book;
      this.scene.add(book.root);
      this.stage.fitShadow(book.pageWidth, book.pageHeight / 2);

      const textures = new PageTextureManager(provider, book, this.renderer, this.invalidate);
      this.textures = textures;
      textures.onThumbnail = (page, image) => this.emit('thumbnail', page, image);
      textures.onProgress = (ready, total) => this.emit('progress', ready, total);
      book.onSpreadChange = (spread) => {
        textures.focus(spread.index);
        this.emit('spread', spread);
      };
      textures.focus(book.spread.index);
      if (keepView) this.homeDistance = this.fitDistance();
      else this.placeCamera(false);
    }
    this.emit('spread', this.book?.spread ?? null);
    this.invalidate();
  }

  getThumbnail(pageIndex: number): PageImage | undefined {
    return this.textures?.getThumbnail(pageIndex);
  }

  next(): void {
    if (this.director) return;
    this.book?.next();
    this.invalidate();
  }

  prev(): void {
    if (this.director) return;
    this.book?.prev();
    this.invalidate();
  }

  goToPage(pageIndex: number): void {
    if (this.director) return;
    this.book?.goToPage(pageIndex);
    this.invalidate();
  }

  goToSpread(index: number): void {
    if (this.director) return;
    this.book?.goToSpread(index);
    this.invalidate();
  }

  /** factor < 1 acerca, > 1 aleja. */
  zoom(factor: number): void {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const distance = MathUtils.clamp(offset.length() * factor, this.controls.minDistance, this.controls.maxDistance);
    this.cameraTouched = true;
    this.animateCamera(this.controls.target.clone().add(offset.setLength(distance)), this.controls.target.clone());
  }

  resetView(): void {
    this.placeCamera(true);
  }

  invalidate = (): void => {
    this.needsRender = true;
  };

  // ── Estudio: fotos y videos ───────────────────────────────────────────────

  get isStudio(): boolean {
    return this.studio;
  }

  enterStudio(): void {
    if (this.studio) return;
    this.studio = true;
    this.post ??= new PostFX(this.renderer, this.scene, this.camera);
    this.resize();
  }

  exitStudio(): void {
    if (!this.studio) return;
    this.stopDirector();
    this.studio = false;
    this.frameAspect = null;
    this.stage.setBackdrop(this.scene, null);
    this.stage.setLighting('estudio');
    this.post?.set(NEUTRAL_LOOK);
    this.book?.holdLeaf(0);
    this.camera.fov = DEFAULT_FOV;
    this.camera.updateProjectionMatrix();
    this.resize();
  }

  setLighting(id: string): void {
    this.stage.setLighting(id);
    this.invalidate();
  }

  setBackdrop(backdrop: Backdrop | null): void {
    this.stage.setBackdrop(this.scene, backdrop);
    this.invalidate();
  }

  setLook(look: Partial<LookSettings>): void {
    this.post?.set(look);
    this.invalidate();
  }

  /** Relación ancho/alto del cuadro de foto/video (null = toda la pantalla). */
  setFrameAspect(aspect: number | null): void {
    this.frameAspect = aspect;
    this.resize();
  }

  get focalLength(): number {
    return this.camera.getFocalLength();
  }

  /**
   * Cambia la lente (mm, equivalente 35 mm). Con `keepFraming` la cámara se
   * aleja o acerca para que el libro conserve su tamaño en cuadro: sólo cambia
   * la perspectiva, como al cambiar de objetivo y de posición en un set.
   */
  setFocalLength(mm: number, keepFraming = true): void {
    const before = this.camera.getFocalLength();
    this.camera.setFocalLength(mm);
    if (keepFraming && before > 0) {
      const offset = this.camera.position.clone().sub(this.controls.target);
      this.camera.position.copy(this.controls.target).add(offset.multiplyScalar(mm / before));
      this.controls.update();
    }
    this.cameraTween = null;
    this.invalidate();
  }

  setViewPreset(preset: ViewPreset): void {
    const book = this.book;
    if (!book) return;
    const W = book.pageWidth;
    const H = book.pageHeight;
    const open = book.spread.index > 0 && book.spread.index < book.leafCount;
    const region = { width: open ? 2 * W : W, depth: H };
    const views: Record<ViewPreset, { azimuth: number; elevation: number; target: [number, number, number]; margin: number; region?: typeof region }> = {
      frontal: { azimuth: 0, elevation: 58, target: [0, 0, 0.05 * H], margin: 1.12 },
      tresCuartos: { azimuth: -32, elevation: 36, target: [0, 0.05, 0], margin: 1.12 },
      cenital: { azimuth: 0, elevation: 86, target: [0, 0, 0], margin: 1.08 },
      rasante: { azimuth: -24, elevation: 13, target: [open ? W * 0.3 : 0, 0.2, 0.3], margin: 1.02 },
      detalle: { azimuth: 16, elevation: 48, target: [open ? W * 0.55 : W * 0.1, 0, -H * 0.15], margin: 0.6, region: { width: W, depth: H } },
    };
    const view = views[preset];
    const distance = fitDistance(view.region ?? region, view, this.camera.fov, this.camera.aspect, view.margin);
    const pose: CamPose = { azimuth: view.azimuth, elevation: view.elevation, distance, target: view.target };
    this.cameraTouched = true;
    this.animateCamera(new Vector3(...posePosition(pose)), new Vector3(...pose.target));
  }

  /** Congela la hoja superior derecha a mitad de giro (0..1). */
  holdLeaf(progress: number): void {
    this.book?.holdLeaf(progress);
    this.invalidate();
  }

  /** Coloca la cámara en una pose de fotógrafo (sin animación). */
  applyPose(pose: CamPose): void {
    this.camera.position.set(...posePosition(pose));
    this.controls.target.set(...pose.target);
    this.camera.lookAt(this.controls.target);
    this.invalidate();
  }

  /** Tamaño en píxeles de una exportación con el encuadre actual. */
  exportSize(longSide: number): { width: number; height: number } {
    const aspect = this.frameAspect ?? this.camera.aspect;
    const gl = this.renderer.getContext();
    const limit = Math.min(this.renderer.capabilities.maxTextureSize, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number, 8192);
    const long = Math.min(longSide, limit);
    const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
    return aspect >= 1 ? { width: even(long), height: even(long / aspect) } : { width: even(long * aspect), height: even(long) };
  }

  /** Foto en alta resolución del encuadre actual. */
  async capturePhoto({ longSide, type, transparent = false }: PhotoOptions): Promise<Blob> {
    const { width, height } = this.exportSize(longSide);
    const background = this.scene.background;
    if (transparent) this.scene.background = null;
    try {
      return await this.renderSession(width, height, null, async (draw) => {
        draw(this.clock, !transparent);
        return canvasToBlob(this.renderer.domElement, type, 0.95);
      });
    } finally {
      this.scene.background = background;
      this.invalidate();
    }
  }

  /**
   * Sesión de render fuera de tiempo real a un tamaño fijo (videos): el bucle
   * interactivo se pausa, `draw()` dibuja un cuadro en el lienzo y al terminar
   * se restauran tamaño, cámara, doble página y look.
   */
  async renderSession<T>(
    width: number,
    height: number,
    fov: number | null,
    work: (draw: (time: number, effects?: boolean) => void, canvas: HTMLCanvasElement) => Promise<T>,
  ): Promise<T> {
    if (this.offline) throw new Error('Ya hay una exportación en curso.');
    const snapshot = this.snapshot();
    this.stopDirector();
    this.offline = true;
    cancelAnimationFrame(this.frameHandle);
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.post?.setSize(width, height);
    if (fov) this.camera.fov = fov;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    try {
      return await work((time, effects = true) => this.draw(time, effects), this.renderer.domElement);
    } finally {
      this.offline = false;
      this.restore(snapshot);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.resize();
      this.frameHandle = requestAnimationFrame(this.frame);
    }
  }

  /** Reproduce un director en tiempo real (vista previa); `onEnd` al terminar o detenerlo. */
  play(director: Director, onEnd: () => void, fov?: number): void {
    this.stopDirector();
    this.director = { director, onEnd, snapshot: this.snapshot() };
    this.controls.enabled = false;
    this.cameraTween = null;
    if (fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  stopDirector(): void {
    const active = this.director;
    if (!active) return;
    this.director = null;
    this.controls.enabled = true;
    this.restore(active.snapshot);
    active.onEnd();
  }

  async preloadPages(pages: readonly number[], onProgress?: (done: number, total: number) => void): Promise<void> {
    await this.textures?.preload(pages, onProgress);
  }

  unpinPages(): void {
    this.textures?.unpin();
  }

  dispose(): void {
    cancelAnimationFrame(this.frameHandle);
    this.director = null;
    this.resizeObserver.disconnect();
    this.interaction.dispose();
    this.controls.dispose();
    this.textures?.dispose();
    this.book?.dispose();
    this.post?.dispose();
    this.stage.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ── Interno ───────────────────────────────────────────────────────────────

  private get pixelRatio(): number {
    return Math.min(window.devicePixelRatio, 2);
  }

  private emit<K extends keyof BookEngineEvents>(event: K, ...args: Parameters<BookEngineEvents[K]>): void {
    for (const listener of this.listeners[event]) (listener as (...a: Parameters<BookEngineEvents[K]>) => void)(...args);
  }

  private draw(time: number, effects = true): void {
    if (this.studio && this.post && effects) {
      this.post.render(this.camera.position.distanceTo(this.controls.target), time);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  private snapshot(): ViewSnapshot {
    return {
      position: this.camera.position.clone(),
      target: this.controls.target.clone(),
      fov: this.camera.fov,
      spread: this.spreadIndex,
      look: { ...(this.post?.current ?? NEUTRAL_LOOK) },
    };
  }

  private restore(snapshot: ViewSnapshot): void {
    this.camera.position.copy(snapshot.position);
    this.controls.target.copy(snapshot.target);
    this.camera.fov = snapshot.fov;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.post?.set(snapshot.look);
    this.book?.jumpTo(snapshot.spread);
    this.invalidate();
  }

  private frame = (timestamp: number): void => {
    this.frameHandle = requestAnimationFrame(this.frame);
    this.timer.update(timestamp);
    const dt = Math.min(this.timer.getDelta(), 1 / 20);
    this.clock += dt;

    if (this.director) {
      const running = this.director.director.step(dt);
      this.draw(this.clock);
      if (!running) this.stopDirector();
      return;
    }

    if (this.cameraTween) {
      const tween = this.cameraTween;
      tween.t = Math.min(1, tween.t + dt / 0.6);
      const e = 1 - (1 - tween.t) ** 3;
      this.camera.position.lerpVectors(tween.fromPos, tween.toPos, e);
      this.controls.target.lerpVectors(tween.fromTarget, tween.toTarget, e);
      if (tween.t >= 1) this.cameraTween = null;
      this.needsRender = true;
    }
    if (this.controls.update(dt)) this.needsRender = true;
    if (this.book?.update(dt)) this.needsRender = true;
    // El grano de película cambia cada cuadro.
    if (this.studio && (this.post?.current.grain ?? 0) > 0) this.needsRender = true;

    if (this.needsRender) {
      this.needsRender = false;
      this.draw(this.clock);
    }
  };

  private resize(): void {
    if (this.offline) return;
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    // En estudio el lienzo toma la proporción del cuadro elegido (lo que se ve es lo que se exporta).
    let width = w;
    let height = h;
    if (this.frameAspect) {
      // Márgenes para no quedar debajo de la barra superior ni del paginador.
      const availW = Math.max(1, w - 2 * 110);
      const availH = Math.max(1, h - 96 - 84);
      if (availW / availH > this.frameAspect) {
        height = availH;
        width = Math.round(availH * this.frameAspect);
      } else {
        width = availW;
        height = Math.round(availW / this.frameAspect);
      }
    }
    this.renderer.setSize(width, height, true);
    this.post?.setSize(Math.round(width * this.pixelRatio), Math.round(height * this.pixelRatio));
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (this.cameraTouched) this.homeDistance = this.fitDistance();
    else this.placeCamera(!!this.book);
    this.invalidate();
  }

  /** Distancia a la que el libro abierto (2 páginas) entra completo en pantalla. */
  private fitDistance(): number {
    const width = (this.book?.pageWidth ?? 2.1) * 2;
    const height = this.book?.pageHeight ?? 3;
    const vFov = MathUtils.degToRad(this.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    const elevation = MathUtils.degToRad(VIEW_ELEVATION);
    const fitH = (width * 0.56) / Math.tan(hFov / 2);
    const fitV = (height * Math.sin(elevation) * 0.62) / Math.tan(vFov / 2);
    return Math.max(fitH, fitV);
  }

  private placeCamera(animated: boolean): void {
    this.cameraTouched = false;
    this.homeDistance = this.fitDistance();
    const elevation = MathUtils.degToRad(VIEW_ELEVATION);
    const target = new Vector3(0, 0, 0.05 * (this.book?.pageHeight ?? 3));
    const position = new Vector3(0, Math.sin(elevation), Math.cos(elevation)).multiplyScalar(this.homeDistance).add(target);
    if (animated) this.animateCamera(position, target);
    else {
      this.cameraTween = null;
      this.camera.position.copy(position);
      this.controls.target.copy(target);
      this.controls.update();
      this.invalidate();
    }
  }

  private animateCamera(toPos: Vector3, toTarget: Vector3): void {
    this.cameraTween = {
      fromPos: this.camera.position.clone(),
      toPos,
      fromTarget: this.controls.target.clone(),
      toTarget,
      t: 0,
    };
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo generar la imagen.'))), type, quality),
  );
}
