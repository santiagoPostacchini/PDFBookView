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
import { Book, type BookOptions } from './Book';
import { PageInteraction } from './PageInteraction';
import { PageTextureManager } from './PageTextureManager';
import { Stage } from './Stage';
import type { PageImage, PageImageProvider, SpreadInfo } from './types';

export interface BookEngineEvents {
  spread: (spread: SpreadInfo | null) => void;
  thumbnail: (pageIndex: number, image: PageImage) => void;
  progress: (ready: number, total: number) => void;
}

type Listeners = { [K in keyof BookEngineEvents]: Set<BookEngineEvents[K]> };

/** Elevación de la vista por defecto (grados sobre la mesa). */
const VIEW_ELEVATION = 58;

/**
 * Motor 3D independiente del framework de UI: escena, cámara, controles,
 * bucle de render (sólo dibuja cuando algo cambia) y ciclo de vida del libro.
 */
export class BookEngine {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(32, 1, 0.05, 200);
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

  constructor(private readonly container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
    this.controls.maxDistance = 30;
    this.controls.addEventListener('change', this.invalidate);
    this.controls.addEventListener('start', () => {
      this.cameraTouched = true;
      this.cameraTween = null;
    });

    this.interaction = new PageInteraction(
      this.renderer.domElement,
      this.camera,
      this.controls,
      () => this.book,
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

  /**
   * Construye un libro nuevo a partir de un proveedor de páginas (null lo quita).
   * Con `keepView` conserva la cámara (p. ej. al rearmar el mismo documento).
   */
  setBook(provider: PageImageProvider | null, options: Partial<BookOptions> & { keepView?: boolean } = {}): void {
    const { keepView = false, ...bookOptions } = options;
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
    this.book?.next();
    this.invalidate();
  }

  prev(): void {
    this.book?.prev();
    this.invalidate();
  }

  goToPage(pageIndex: number): void {
    this.book?.goToPage(pageIndex);
    this.invalidate();
  }

  goToSpread(index: number): void {
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

  dispose(): void {
    cancelAnimationFrame(this.frameHandle);
    this.resizeObserver.disconnect();
    this.interaction.dispose();
    this.controls.dispose();
    this.textures?.dispose();
    this.book?.dispose();
    this.stage.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private emit<K extends keyof BookEngineEvents>(event: K, ...args: Parameters<BookEngineEvents[K]>): void {
    for (const listener of this.listeners[event]) (listener as (...a: Parameters<BookEngineEvents[K]>) => void)(...args);
  }

  private frame = (timestamp: number): void => {
    this.frameHandle = requestAnimationFrame(this.frame);
    this.timer.update(timestamp);
    const dt = Math.min(this.timer.getDelta(), 1 / 20);

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

    if (this.needsRender) {
      this.needsRender = false;
      this.renderer.render(this.scene, this.camera);
    }
  };

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
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
