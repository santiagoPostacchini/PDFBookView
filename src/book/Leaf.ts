import { BoxGeometry, Mesh, Sphere, Vector3, type Material, type Texture } from 'three';
import { flexPose, PaperDeformer, type LeafPose } from './paperDeformer';
import { blankPaperTexture, createPaperMaterial, type PaperMaterial } from './paperMaterial';

export type Face = 'front' | 'back';

export interface LeafSpec {
  index: number;
  width: number;
  height: number;
  thickness: number;
  /** Altura del lomo cuando la hoja descansa en la pila derecha / izquierda. */
  restZRight: number;
  restZLeft: number;
  /** 0 = papel flexible, 1 = cartón rígido (tapas). */
  stiffness: number;
  segmentsX: number;
  segmentsY: number;
  gutterStrength: number;
  gutterWidth: number;
  /** Material compartido para los cantos. */
  edgeMaterial: Material;
}

const smoothstep = (t: number) => t * t * (3 - 2 * t);

/**
 * Una hoja física del libro: una malla con espesor cuya cara frontal (+z)
 * muestra la página impar y la trasera (−z) la página par siguiente.
 * Orden de grupos de BoxGeometry: +x canto, −x lomo, +y, −y, +z frente, −z dorso.
 */
export class Leaf {
  readonly mesh: Mesh<BoxGeometry, Material[]>;
  readonly front: PaperMaterial;
  readonly back: PaperMaterial;
  readonly pose: LeafPose = { angle: 0, curl: 0, twist: 0, curlTwist: 0 };
  private readonly deformer: PaperDeformer;
  private dirty = true;

  constructor(readonly spec: LeafSpec) {
    const { width, height, thickness, segmentsX, segmentsY } = spec;
    const geometry = new BoxGeometry(width, height, thickness, segmentsX, segmentsY, 1);
    geometry.translate(width / 2, 0, 0); // el lomo queda en x = 0
    // La hoja puede ocupar cualquier punto de la semiesfera alrededor del lomo:
    // una esfera fija evita recalcularla en cada cuadro.
    geometry.boundingSphere = new Sphere(new Vector3(0, 0, 0), Math.hypot(width, height / 2) + 1);

    this.front = createPaperMaterial({
      spineAtU: 0,
      gutterStrength: spec.gutterStrength,
      gutterWidth: spec.gutterWidth,
      roughness: 0.82,
    });
    this.back = createPaperMaterial({
      spineAtU: 1,
      gutterStrength: spec.gutterStrength,
      gutterWidth: spec.gutterWidth,
      roughness: 0.82,
    });
    const edge = spec.edgeMaterial;
    this.mesh = new Mesh(geometry, [edge, edge, edge, edge, this.front, this.back]);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.userData.leaf = this;
    this.deformer = new PaperDeformer(geometry, width, height, segmentsX, segmentsY);
    this.update(1);
  }

  get index(): number {
    return this.spec.index;
  }

  /** 0 = apoyada a la derecha, 1 = apoyada a la izquierda. */
  get progress(): number {
    return this.pose.angle / Math.PI;
  }

  setPose(pose: Partial<LeafPose>): void {
    for (const key of Object.keys(pose) as (keyof LeafPose)[]) {
      if (pose[key] !== this.pose[key]) this.dirty = true;
    }
    Object.assign(this.pose, pose);
  }

  /** Aplica la pose a la malla si cambió. Devuelve true si hubo que deformar. */
  update(maxCurl: number): boolean {
    if (!this.dirty) return false;
    this.dirty = false;
    const flex = 1 - this.spec.stiffness;
    const pivotZ = this.spec.restZRight + (this.spec.restZLeft - this.spec.restZRight) * smoothstep(this.progress);
    this.deformer.apply(flexPose(this.pose, flex), pivotZ, maxCurl * flex);
    return true;
  }

  setFaceTexture(face: Face, texture: Texture | null): void {
    const material = face === 'front' ? this.front : this.back;
    // Siempre hay un mapa (papel liso de reserva), así USE_MAP no cambia y el
    // programa no se recompila: sólo se actualiza el uniform.
    material.map = texture ?? blankPaperTexture();
  }

  setGutter(strength: number, width: number): void {
    for (const material of [this.front, this.back]) {
      material.userData.uniforms.uGutterStrength.value = strength;
      material.userData.uniforms.uGutterWidth.value = width;
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.front.dispose();
    this.back.dispose();
  }
}
