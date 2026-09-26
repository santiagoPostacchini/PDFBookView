import {
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  PlaneGeometry,
  ShadowMaterial,
} from 'three';

/**
 * Iluminación y "mesa". Separado del libro para poder cambiar la estética
 * (luces, sombras, entorno) sin tocar la lógica de páginas.
 */
export class Stage {
  readonly group = new Group();
  readonly key: DirectionalLight;
  readonly ground: Mesh<PlaneGeometry, ShadowMaterial>;

  constructor() {
    const hemi = new HemisphereLight('#ffffff', '#b9b2a6', 1.55);
    this.group.add(hemi);

    // Luz principal con sombras suaves: marca el arco de la hoja al girar.
    this.key = new DirectionalLight('#fff6ea', 2.1);
    this.key.position.set(-3.5, 9, 5);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.015;
    this.key.shadow.radius = 4;
    this.group.add(this.key, this.key.target);

    const fill = new DirectionalLight('#dfe8ff', 0.35);
    fill.position.set(5, 4, -3);
    this.group.add(fill);

    this.ground = new Mesh(new PlaneGeometry(60, 60), new ShadowMaterial({ opacity: 0.28 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.002;
    this.ground.receiveShadow = true;
    this.group.add(this.ground);
  }

  /** Ajusta la cámara de sombras al tamaño del libro abierto. */
  fitShadow(halfWidth: number, halfDepth: number): void {
    const cam = this.key.shadow.camera;
    const reach = Math.max(halfWidth, halfDepth) * 1.25;
    cam.left = -reach;
    cam.right = reach;
    cam.top = reach;
    cam.bottom = -reach;
    cam.near = 0.5;
    cam.far = 30;
    cam.updateProjectionMatrix();
  }

  dispose(): void {
    this.ground.geometry.dispose();
    this.ground.material.dispose();
    this.key.shadow.map?.dispose();
  }
}
