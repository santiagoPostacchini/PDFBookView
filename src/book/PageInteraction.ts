import { Plane, Raycaster, Vector2, Vector3, type Camera } from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Book, Side } from './Book';

/** Píxeles que hay que mover el puntero para que un clic pase a ser arrastre. */
const DRAG_THRESHOLD = 6;

interface Pending {
  pointerId: number;
  startX: number;
  startY: number;
  side: Side;
  grab: Vector2;
  dragging: boolean;
}

/**
 * Traduce el puntero en acciones sobre el libro:
 *  - clic sobre la página derecha/izquierda → pasar hoja adelante/atrás,
 *  - arrastre → la hoja sigue al puntero (proyectado sobre el plano del libro),
 *  - fuera del libro → la cámara orbita (OrbitControls).
 */
export class PageInteraction {
  private readonly raycaster = new Raycaster();
  private readonly ndc = new Vector2();
  private readonly plane = new Plane(new Vector3(0, 1, 0), 0);
  private readonly hit = new Vector3();
  private pending: Pending | null = null;

  constructor(
    private readonly dom: HTMLElement,
    private readonly camera: Camera,
    private readonly controls: OrbitControls,
    private readonly getBook: () => Book | null,
    private readonly invalidate: () => void,
  ) {
    // En captura: corre antes que OrbitControls y puede "robarle" el gesto.
    dom.addEventListener('pointerdown', this.onPointerDown, { capture: true });
    dom.addEventListener('pointermove', this.onPointerMove);
    dom.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('pointercancel', this.onPointerCancel);
  }

  dispose(): void {
    this.dom.removeEventListener('pointerdown', this.onPointerDown, { capture: true });
    this.dom.removeEventListener('pointermove', this.onPointerMove);
    this.dom.removeEventListener('pointerup', this.onPointerUp);
    this.dom.removeEventListener('pointercancel', this.onPointerCancel);
  }

  private onPointerDown = (event: PointerEvent) => {
    const book = this.getBook();
    if (this.pending) {
      // Segundo dedo (pinch): se abandona el gesto de página.
      if (this.pending.dragging) book?.endDrag(true);
      this.release();
      return;
    }
    if (!book || event.button !== 0) return;
    const grab = this.pickBook(event, book);
    if (!grab) return;
    const side: Side = grab.x >= 0 ? 'right' : 'left';
    if (!book.canDrag(side)) return;

    this.controls.enabled = false;
    this.dom.setPointerCapture(event.pointerId);
    this.pending = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, side, grab, dragging: false };
  };

  private onPointerMove = (event: PointerEvent) => {
    const book = this.getBook();
    if (!book) return;
    const pending = this.pending;
    if (!pending) {
      this.dom.style.cursor = this.pickBook(event, book) ? 'grab' : '';
      return;
    }
    if (event.pointerId !== pending.pointerId) return;
    if (!pending.dragging) {
      const moved = Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY);
      if (moved < DRAG_THRESHOLD) return;
      pending.dragging = book.beginDrag(pending.side, pending.grab);
      if (!pending.dragging) return;
      this.dom.style.cursor = 'grabbing';
    }
    const point = this.projectToBookPlane(event, book);
    if (point) book.updateDrag(point);
    this.invalidate();
  };

  private onPointerUp = (event: PointerEvent) => {
    const pending = this.pending;
    if (!pending || event.pointerId !== pending.pointerId) return;
    const book = this.getBook();
    if (book) {
      if (pending.dragging) book.endDrag();
      else if (pending.side === 'right') book.next();
      else book.prev();
    }
    this.release();
    this.invalidate();
  };

  private onPointerCancel = (event: PointerEvent) => {
    if (!this.pending || event.pointerId !== this.pending.pointerId) return;
    if (this.pending.dragging) this.getBook()?.endDrag(true);
    this.release();
  };

  private release(): void {
    if (this.pending && this.dom.hasPointerCapture(this.pending.pointerId)) {
      this.dom.releasePointerCapture(this.pending.pointerId);
    }
    this.pending = null;
    this.controls.enabled = true;
    this.dom.style.cursor = '';
  }

  private setRay(event: PointerEvent): void {
    const rect = this.dom.getBoundingClientRect();
    this.ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
  }

  /** Punto tocado del libro en coordenadas del libro, o null si el puntero no está sobre él. */
  private pickBook(event: PointerEvent, book: Book): Vector2 | null {
    this.setRay(event);
    const [first] = this.raycaster.intersectObjects(book.leaves.map((l) => l.mesh), false);
    if (!first) return null;
    return book.worldToBook(first.point);
  }

  private projectToBookPlane(event: PointerEvent, book: Book): Vector2 | null {
    this.setRay(event);
    book.root.updateWorldMatrix(true, false);
    this.plane.constant = -(book.root.position.y + book.stackHeight / 2);
    if (!this.raycaster.ray.intersectPlane(this.plane, this.hit)) return null;
    return book.worldToBook(this.hit);
  }
}
