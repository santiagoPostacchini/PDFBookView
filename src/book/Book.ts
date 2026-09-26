import { Group, MeshStandardMaterial, Vector2, type Texture, type Vector3 } from 'three';
import { DEFAULT_FLIP, easeInOutCubic, easeOutCubic, flipArc, FlipTween, type FlipTuning } from './flipAnimation';
import { Leaf, type Face } from './Leaf';
import { FLAT_RIGHT, flexPose, projectedReach, rowShape, type LeafPose } from './paperDeformer';
import type { SpreadInfo } from './types';

export interface BookOptions {
  pageCount: number;
  /** Ancho / alto de página. */
  pageAspect: number;
  /** Alto de página en unidades de escena. */
  pageHeight?: number;
  /** Primera y última hoja rígidas (tapas de cartón). */
  hardCovers?: boolean;
  /** Tope de curvatura del papel (rad). */
  maxCurl?: number;
  gutterStrength?: number;
  gutterWidth?: number;
  flip?: Partial<FlipTuning>;
  /** Doble página inicial (hojas ya pasadas a la izquierda), sin animación. */
  initialSpread?: number;
}

export type Side = 'left' | 'right';

interface DragState {
  leaf: Leaf;
  dir: 1 | -1;
  /** Distancia al lomo del punto tomado: la proyección de ese punto sigue al puntero. */
  radius: number;
  /** Altura normalizada del punto tomado (−1 abajo … +1 arriba). */
  yN: number;
  target: number;
  velocity: number;
}

/** Curvatura con la que el borde tomado adelanta al lomo. */
const DRAG_CURL = 0.8;
/** Diferencia de curvatura entre la esquina tomada y la opuesta. */
const DRAG_CURL_TWIST = 0.8;
/** Torsión máxima (rad) al tomar la hoja de una esquina; ≤ 1 mantiene cada fila en [0, π]. */
const DRAG_TWIST = 0.45;
/** rad/s a partir de los cuales un "latigazo" decide el giro aunque no pase la mitad. */
const FLICK_SPEED = 2.5;

export function pageToLeafFace(pageIndex: number): { leaf: number; face: Face } {
  return { leaf: Math.floor(pageIndex / 2), face: pageIndex % 2 === 0 ? 'front' : 'back' };
}

/**
 * Libro 3D: pila de hojas articuladas en el lomo (x = 0). El estado navegable
 * es `spreadIndex` = cantidad de hojas del lado izquierdo; cada hoja se anima
 * de forma independiente, así los giros encadenados se superponen con naturalidad.
 *
 * Sistema local (`content`): el libro yace en el plano XY, +Z hacia arriba,
 * páginas de la derecha en x > 0. `root` lo acuesta en el plano XZ del mundo.
 */
export class Book {
  readonly root = new Group();
  readonly content = new Group();
  readonly leaves: Leaf[] = [];
  readonly pageCount: number;
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly stackHeight: number;
  onSpreadChange?: (spread: SpreadInfo) => void;

  private readonly tuning: FlipTuning;
  private readonly maxCurl: number;
  private readonly edgeMaterial: MeshStandardMaterial;
  private readonly tweens = new Map<Leaf, FlipTween>();
  private drag: DragState | null = null;
  private heldLeaf: Leaf | null = null;
  private spreadIndex = 0;

  constructor(options: BookOptions) {
    const {
      pageCount,
      pageAspect,
      pageHeight = 3,
      hardCovers = false,
      maxCurl = 1.4,
      gutterStrength = 0.28,
      gutterWidth = 0.09,
    } = options;
    this.pageCount = pageCount;
    this.pageHeight = pageHeight;
    this.pageWidth = pageHeight * pageAspect;
    this.maxCurl = maxCurl;
    this.tuning = { ...DEFAULT_FLIP, ...options.flip };

    const leafCount = Math.ceil(pageCount / 2);
    const thickness = Math.max(0.0015, Math.min(0.012, 0.35 / leafCount)) * (pageHeight / 3);
    const gap = thickness * 1.15;
    this.stackHeight = leafCount * gap;

    this.edgeMaterial = new MeshStandardMaterial({ color: '#eee7d8', roughness: 0.95 });
    for (let index = 0; index < leafCount; index++) {
      const isCover = hardCovers && leafCount >= 3 && (index === 0 || index === leafCount - 1);
      const leaf = new Leaf({
        index,
        width: this.pageWidth,
        height: pageHeight,
        thickness: isCover ? thickness * 2 : thickness,
        restZRight: (leafCount - 1 - index) * gap + thickness / 2,
        restZLeft: index * gap + thickness / 2,
        stiffness: isCover ? 0.9 : 0,
        segmentsX: 48,
        segmentsY: 8,
        gutterStrength,
        gutterWidth,
        edgeMaterial: this.edgeMaterial,
      });
      this.leaves.push(leaf);
      this.content.add(leaf.mesh);
    }

    this.content.rotation.x = -Math.PI / 2;
    this.root.add(this.content);

    this.spreadIndex = Math.max(0, Math.min(leafCount, Math.round(options.initialSpread ?? 0)));
    for (let k = 0; k < this.spreadIndex; k++) this.leaves[k].setPose({ angle: Math.PI });
    this.root.position.x = this.centerOffset();
  }

  get leafCount(): number {
    return this.leaves.length;
  }

  get isDragging(): boolean {
    return this.drag !== null;
  }

  get spread(): SpreadInfo {
    const f = this.spreadIndex;
    const left = 2 * f - 1;
    const right = 2 * f;
    return {
      index: f,
      leafCount: this.leafCount,
      pageCount: this.pageCount,
      leftPage: f > 0 && left < this.pageCount ? left : null,
      rightPage: f < this.leafCount && right < this.pageCount ? right : null,
    };
  }

  setPageTexture(pageIndex: number, texture: Texture | null): void {
    const { leaf, face } = pageToLeafFace(pageIndex);
    this.leaves[leaf]?.setFaceTexture(face, texture);
  }

  // ── Navegación ────────────────────────────────────────────────────────────

  next(): void {
    this.goToSpread(this.spreadIndex + 1);
  }

  prev(): void {
    this.goToSpread(this.spreadIndex - 1);
  }

  /** Abre el libro en la doble página donde se ve `pageIndex` (0-based). */
  goToPage(pageIndex: number): void {
    this.goToSpread(Math.ceil(pageIndex / 2));
  }

  /** @param speed multiplicador de velocidad de giro (2 = el doble de rápido). */
  goToSpread(target: number, speed = 1): void {
    if (this.drag) return;
    target = Math.max(0, Math.min(this.leafCount, Math.round(target)));
    const from = this.spreadIndex;
    if (target === from) return;
    this.releaseHeldLeaf();

    const forward = target > from;
    const indices: number[] = [];
    if (forward) for (let k = from; k < target; k++) indices.push(k);
    else for (let k = from - 1; k >= target; k--) indices.push(k);

    // Saltos largos: cascada de hojas escalonada y algo más rápida.
    const stagger = (indices.length > 1 ? Math.min(0.09, 0.8 / indices.length) : 0) / speed;
    const leafSpeed = (indices.length > 2 ? 1.35 : 1) * speed;
    indices.forEach((k, i) => {
      const leaf = this.leaves[k];
      this.tweens.set(leaf, new FlipTween(leaf.pose, forward ? Math.PI : 0, this.tuning, i * stagger, easeInOutCubic, leafSpeed));
    });
    this.spreadIndex = target;
    this.onSpreadChange?.(this.spread);
  }

  /** Salta a una doble página sin animación (hojas y centrado en su lugar final). */
  jumpTo(target: number): void {
    this.drag = null;
    this.tweens.clear();
    this.heldLeaf = null;
    this.spreadIndex = Math.max(0, Math.min(this.leafCount, Math.round(target)));
    this.leaves.forEach((leaf, k) => leaf.setPose({ ...FLAT_RIGHT, angle: k < this.spreadIndex ? Math.PI : 0 }));
    this.root.position.x = this.centerOffset();
    this.onSpreadChange?.(this.spread);
  }

  get isAnimating(): boolean {
    return this.tweens.size > 0 || this.drag !== null;
  }

  /**
   * Congela la hoja superior derecha a mitad de giro (0 = apoyada, 1 = del otro
   * lado), con la curvatura natural del papel. Útil para fotos de producto.
   */
  holdLeaf(progress: number): void {
    const leaf = this.leaves[this.spreadIndex];
    if (!leaf || this.drag) return;
    const e = Math.max(0, Math.min(0.98, progress));
    if (this.heldLeaf && this.heldLeaf !== leaf) this.releaseHeldLeaf();
    this.tweens.delete(leaf);
    this.heldLeaf = e > 0 ? leaf : null;
    leaf.setPose({ ...FLAT_RIGHT, angle: Math.PI * e, curl: flipArc(e, this.tuning) });
  }

  private releaseHeldLeaf(): void {
    if (!this.heldLeaf) return;
    this.heldLeaf.setPose({ ...FLAT_RIGHT, angle: this.heldLeaf.index < this.spreadIndex ? Math.PI : 0 });
    this.heldLeaf = null;
  }

  // ── Arrastre ──────────────────────────────────────────────────────────────

  /** Convierte un punto del mundo a coordenadas del plano del libro (x: lomo→borde, y: alto). */
  worldToBook(point: Vector3): Vector2 {
    const local = this.content.worldToLocal(point.clone());
    return new Vector2(local.x, local.y);
  }

  canDrag(side: Side): boolean {
    return !this.drag && (side === 'right' ? this.spreadIndex < this.leafCount : this.spreadIndex > 0);
  }

  beginDrag(side: Side, grab: Vector2): boolean {
    if (!this.canDrag(side)) return false;
    this.releaseHeldLeaf();
    const leaf = this.leaves[side === 'right' ? this.spreadIndex : this.spreadIndex - 1];
    this.tweens.delete(leaf);
    this.drag = {
      leaf,
      dir: side === 'right' ? 1 : -1,
      radius: Math.max(0.3 * this.pageWidth, Math.min(this.pageWidth, Math.abs(grab.x))),
      yN: Math.max(-1, Math.min(1, grab.y / (this.pageHeight / 2))),
      target: leaf.pose.angle,
      velocity: 0,
    };
    return true;
  }

  updateDrag(pointer: Vector2): void {
    if (!this.drag) return;
    this.drag.target = this.solveDragAngle(this.drag, pointer.x);
  }

  /** Suelta la hoja: completa el giro si pasó la mitad o si hubo un latigazo; si no, vuelve. */
  endDrag(cancel = false): void {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    const { leaf, dir, velocity } = drag;
    let complete = dir > 0 ? leaf.pose.angle > Math.PI / 2 : leaf.pose.angle < Math.PI / 2;
    if (dir * velocity > FLICK_SPEED) complete = true;
    else if (dir * velocity < -FLICK_SPEED) complete = false;
    if (cancel) complete = false;

    const toAngle = dir > 0 === complete ? Math.PI : 0;
    this.tweens.set(leaf, new FlipTween(leaf.pose, toAngle, this.tuning, 0, easeOutCubic));
    if (complete) {
      this.spreadIndex += dir;
      this.onSpreadChange?.(this.spread);
    }
  }

  // ── Cuadro a cuadro ───────────────────────────────────────────────────────

  /** Avanza animaciones y deformaciones. Devuelve true si algo se movió. */
  update(dt: number): boolean {
    let active = false;

    if (this.drag) {
      const drag = this.drag;
      const prev = drag.leaf.pose.angle;
      const angle = prev + (drag.target - prev) * (1 - Math.exp(-dt * 18));
      drag.leaf.setPose(this.dragPose(angle, drag));
      if (dt > 0) drag.velocity += ((angle - prev) / dt - drag.velocity) * 0.35;
      active = true;
    }

    for (const [leaf, tween] of this.tweens) {
      const pose = tween.step(dt);
      if (pose) leaf.setPose(pose);
      if (tween.done) {
        leaf.setPose({ ...FLAT_RIGHT, angle: tween.toAngle });
        this.tweens.delete(leaf);
      }
      active = true;
    }

    for (const leaf of this.leaves) leaf.update(this.maxCurl);

    // Con el libro cerrado sólo hay media página a la vista: se centra lo visible.
    const targetX = this.centerOffset();
    const x = this.root.position.x;
    if (Math.abs(targetX - x) > 1e-4) {
      this.root.position.x = x + (targetX - x) * (1 - Math.exp(-dt * 5));
      active = true;
    } else {
      this.root.position.x = targetX;
    }
    return active;
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const leaf of this.leaves) leaf.dispose();
    this.edgeMaterial.dispose();
    this.tweens.clear();
  }

  /**
   * Pose de arrastre: el borde tomado adelanta (curl) y, si se tomó cerca de una
   * esquina, esa esquina gira más que la opuesta (torsión). Ambos se anulan con
   * la hoja apoyada (sin θ = 0).
   */
  private dragPose(angle: number, drag: DragState): LeafPose {
    const sin = Math.max(0, Math.sin(angle));
    const lift = drag.dir * Math.sqrt(sin);
    return {
      angle,
      curl: DRAG_CURL * lift,
      curlTwist: DRAG_CURL_TWIST * drag.yN * lift,
      twist: drag.dir * DRAG_TWIST * drag.yN * sin,
    };
  }

  /**
   * Ángulo de lomo con el que el punto tomado queda exactamente bajo el
   * puntero, teniendo en cuenta la curvatura (bisección: el alcance decrece con el ángulo).
   */
  private solveDragAngle(drag: DragState, pointerX: number): number {
    const flex = 1 - drag.leaf.spec.stiffness;
    const t = drag.radius / this.pageWidth;
    const reach = (angle: number) => {
      const row = rowShape(flexPose(this.dragPose(angle, drag), flex), drag.yN, this.maxCurl * flex);
      return projectedReach(row.angle, row.bend, t) * this.pageWidth;
    };
    const x = Math.max(reach(Math.PI), Math.min(reach(0), pointerX));
    let lo = 0;
    let hi = Math.PI;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (reach(mid) > x) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }

  private centerOffset(): number {
    if (this.spreadIndex === 0) return -this.pageWidth / 2;
    if (this.spreadIndex === this.leafCount) return this.pageWidth / 2;
    return 0;
  }
}
