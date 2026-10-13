import { Vector3, type PerspectiveCamera } from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { poseFromPosition, posePosition } from '../studio/framing';

/** Mirada desde la posición actual y desplazamiento continuo con teclado. */
export class FlyLook {
  private keys = new Set<string>();
  private pointer: { id: number; x: number; y: number } | null = null;
  constructor(private dom: HTMLElement, private camera: PerspectiveCamera, private controls: OrbitControls,
    private enabled: () => boolean, private changed: () => void, private ended: () => void) {
    dom.addEventListener('pointerdown', this.down);
    dom.addEventListener('pointermove', this.move);
    dom.addEventListener('pointerup', this.up);
    dom.addEventListener('pointercancel', this.up);
    dom.addEventListener('contextmenu', this.menu);
    window.addEventListener('keydown', this.keydown);
    window.addEventListener('keyup', this.keyup);
    window.addEventListener('blur', this.clear);
    window.addEventListener('focusin', this.focus);
  }
  private focus = (e: Event) => {
    if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) this.clear();
  };
  private menu = (e: Event) => e.preventDefault();
  private down = (e: PointerEvent) => {
    if (e.button !== 2 || !this.enabled()) return;
    e.preventDefault(); this.dom.setPointerCapture(e.pointerId);
    this.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  private move = (e: PointerEvent) => {
    const p = this.pointer;
    if (!p || p.id !== e.pointerId || !this.enabled()) return;
    const pose = poseFromPosition(this.camera.position.toArray(), this.controls.target.toArray());
    pose.azimuth -= (e.clientX - p.x) * 0.2;
    pose.elevation = Math.max(0, Math.min(86, pose.elevation + (e.clientY - p.y) * 0.2));
    const offset = new Vector3(...posePosition({ ...pose, target: [0, 0, 0] }));
    const target = this.camera.position.clone().sub(offset);
    if (target.toArray().some((v) => Math.abs(v) > 60)) { p.x = e.clientX; p.y = e.clientY; return; }
    this.controls.target.copy(target);
    this.camera.lookAt(this.controls.target);
    p.x = e.clientX; p.y = e.clientY; this.changed();
  };
  private up = (e: PointerEvent) => {
    if (this.pointer?.id !== e.pointerId) return;
    this.pointer = null;
    if (this.dom.hasPointerCapture(e.pointerId)) this.dom.releasePointerCapture(e.pointerId);
    this.ended();
  };
  private keydown = (e: KeyboardEvent) => {
    if (!this.enabled() || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey ||
      (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'))) { this.clear(); return; }
    const key = e.key.toLowerCase();
    if (!'wasdqe'.includes(key) || key.length !== 1) return;
    e.preventDefault(); this.keys.add(key);
  };
  private keyup = (e: KeyboardEvent) => {
    if (this.keys.delete(e.key.toLowerCase()) && !this.keys.size) this.ended();
  };
  private clear = () => { const had = this.keys.size; this.keys.clear(); if (had) this.ended(); };
  update(dt: number): void {
    if (!this.enabled()) { this.clear(); return; }
    if (!this.keys.size) return;
    const right = new Vector3().setFromMatrixColumn(this.camera.matrix, 0);
    const up = new Vector3().setFromMatrixColumn(this.camera.matrix, 1);
    const delta = new Vector3();
    const axis = (a: string, b: string) => Number(this.keys.has(a)) - Number(this.keys.has(b));
    delta.addScaledVector(right, axis('d', 'a')).addScaledVector(up, axis('w', 's'));
    delta.y += axis('e', 'q');
    delta.normalize().multiplyScalar(dt * 3);
    for (let i = 0; i < 3; i++) delta.setComponent(i, Math.max(-60, Math.min(60, this.controls.target.getComponent(i) + delta.getComponent(i))) - this.controls.target.getComponent(i));
    this.camera.position.add(delta); this.controls.target.add(delta); this.changed();
  }
  dispose(): void {
    this.dom.removeEventListener('pointerdown', this.down); this.dom.removeEventListener('pointermove', this.move);
    this.dom.removeEventListener('pointerup', this.up); this.dom.removeEventListener('pointercancel', this.up);
    this.dom.removeEventListener('contextmenu', this.menu);
    window.removeEventListener('keydown', this.keydown); window.removeEventListener('keyup', this.keyup); window.removeEventListener('blur', this.clear); window.removeEventListener('focusin', this.focus);
  }
}
