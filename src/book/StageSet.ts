import {
  CanvasTexture,
  Color,
  Fog,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SpotLight,
  SRGBColorSpace,
  type Group,
  type Scene,
  type Texture,
} from 'three';
import type { Book } from './Book';
import type { LightingPreset } from './Stage';

/**
 * Escenario 3D para fotos y videos de producto: el libro apoya sobre una
 * superficie real (con textura, sombra de contacto y luz que cae en un círculo
 * suave) que se funde con el horizonte. A diferencia del fondo plano, cuando la
 * cámara se mueve la superficie se ve en perspectiva y el libro "está" en un lugar.
 */

export type Surface = 'liso' | 'papel' | 'lino';

export interface StageSetSpec {
  /** Color de la superficie. */
  color: string;
  surface: Surface;
  /** Color del horizonte (donde la superficie se pierde). Por defecto, la superficie en sombra. */
  horizon?: string;
}

export const SET_PRESETS: readonly (StageSetSpec & { id: string; label: string })[] = [
  { id: 'arena', label: 'Arena', color: '#dcc6a8', surface: 'papel' },
  { id: 'lino', label: 'Lino', color: '#ddd3c4', surface: 'lino' },
  { id: 'salvia', label: 'Salvia', color: '#bcc7ae', surface: 'papel' },
  { id: 'rosa', label: 'Rosa', color: '#e9c6c2', surface: 'papel' },
  { id: 'carbon', label: 'Carbón', color: '#3b3734', surface: 'papel' },
  { id: 'noche', label: 'Noche', color: '#28324c', surface: 'papel' },
];

const FLOOR_SIZE = 240;
/** Tamaño (unidades de escena) de un mosaico de la textura: una página mide ~3 de alto. */
const TILE = 2.4;

function noise(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

/** Variación de tono de la superficie (gris medio = sin cambio), en mosaico. */
function surfaceTexture(surface: Surface): Texture | null {
  if (surface === 'liso') return null;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = noise(surface === 'lino' ? 7 : 3);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  const image = ctx.getImageData(0, 0, size, size);
  const data = image.data;
  // Manchas suaves (fibras grandes) + grano fino; en lino, además, trama de hilos.
  const blotch = new Float32Array(17 * 17).map(() => rand());
  const smooth = (x: number, y: number) => {
    const gx = (x / size) * 16;
    const gy = (y / size) * 16;
    const ix = Math.floor(gx);
    const iy = Math.floor(gy);
    const fx = gx - ix;
    const fy = gy - iy;
    const at = (i: number, j: number) => blotch[((j % 16) * 17 + (i % 16)) % blotch.length];
    const top = at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx;
    const bottom = at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx;
    return top * (1 - fy) + bottom * fy;
  };
  const rowsV = new Float32Array(size).map(() => rand());
  const rowsH = new Float32Array(size).map(() => rand());
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 1 + (smooth(x, y) - 0.5) * 0.02 + (rand() - 0.5) * 0.028;
      if (surface === 'lino') {
        const warp = Math.sin((x / size) * Math.PI * 2 * 96) * 0.5 + 0.5;
        const weft = Math.sin((y / size) * Math.PI * 2 * 96) * 0.5 + 0.5;
        v += ((x + y) % 2 ? warp : weft) * 0.04 + (rowsV[x] - 0.5) * 0.035 + (rowsH[y] - 0.5) * 0.035 - 0.02;
      }
      const c = Math.max(0, Math.min(255, Math.round(v * 236)));
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = c;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(FLOOR_SIZE / TILE, FLOOR_SIZE / TILE);
  texture.anisotropy = 8;
  return texture;
}

/** Sombra de contacto: rectángulo difuminado (alfa) del tamaño de una pila de hojas. */
function contactTexture(): Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.filter = 'blur(9px)';
  ctx.fillStyle = '#000';
  const m = size * 0.11;
  ctx.fillRect(m, m, size - 2 * m, size - 2 * m);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class StageSet {
  /** Luz principal en modo escenario: un foco amplio que deja un círculo de luz suave. */
  readonly key = new SpotLight();
  private readonly floor: Mesh<PlaneGeometry, MeshStandardMaterial>;
  private readonly contact: Mesh<PlaneGeometry, MeshBasicMaterial>[];
  private surfaceMap: Texture | null = null;
  private surface: Surface | null = null;
  spec: StageSetSpec | null = null;

  constructor(group: Group) {
    this.floor = new Mesh(new PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE), new MeshStandardMaterial({ roughness: 0.92, metalness: 0 }));
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -0.004;
    this.floor.receiveShadow = true;
    this.floor.visible = false;

    const shadow = contactTexture();
    this.contact = [0, 1].map(() => {
      const mesh = new Mesh(
        new PlaneGeometry(1, 1),
        new MeshBasicMaterial({ map: shadow, transparent: true, depthWrite: false, fog: false, opacity: 0 }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = -0.002;
      mesh.renderOrder = 1;
      mesh.visible = false;
      return mesh;
    });

    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0002;
    this.key.shadow.normalBias = 0.02;
    // Cono angosto con penumbra amplia: el libro queda en la luz y la superficie cae a sombra suave.
    this.key.angle = 0.46;
    this.key.penumbra = 0.65;
    this.key.decay = 0;
    this.key.visible = false;
    group.add(this.floor, ...this.contact, this.key, this.key.target);
  }

  get active(): boolean {
    return this.spec !== null;
  }

  apply(scene: Scene, spec: StageSetSpec | null, lighting: LightingPreset): void {
    this.spec = spec;
    const on = spec !== null;
    this.floor.visible = on;
    this.key.visible = on;
    for (const c of this.contact) c.visible = on;
    if (!spec) {
      scene.fog = null;
      return;
    }
    if (spec.surface !== this.surface) {
      this.surfaceMap?.dispose();
      this.surfaceMap = surfaceTexture(spec.surface);
      this.surface = spec.surface;
    }
    const material = this.floor.material;
    material.color.set(spec.color);
    material.map = this.surfaceMap;
    material.needsUpdate = true;
    // Horizonte: la superficie fuera del círculo de luz (sin luz directa).
    const horizon = new Color(spec.horizon ?? spec.color).multiplyScalar(spec.horizon ? 1 : 0.62);
    scene.fog = new Fog(horizon, 16, 70);
    scene.background = horizon;
    this.setLighting(lighting);
  }

  /** La luz principal del preset, convertida en foco (misma dirección, color e intensidad). */
  setLighting(lighting: LightingPreset): void {
    const [x, y, z] = lighting.key.position;
    const length = Math.hypot(x, y, z) || 1;
    const distance = 13;
    this.key.position.set((x / length) * distance, (y / length) * distance, (z / length) * distance);
    this.key.color.set(lighting.key.color);
    this.key.intensity = lighting.key.intensity * 1.05;
    this.key.shadow.radius = lighting.key.shadowRadius * 1.6;
    this.key.shadow.camera.near = 4;
    this.key.shadow.camera.far = 30;
  }

  /** Sombra de contacto bajo cada pila de hojas, siguiendo al libro cuadro a cuadro. */
  update(book: Book | null): void {
    if (!this.spec || !book) {
      for (const c of this.contact) c.visible = false;
      return;
    }
    const W = book.pageWidth;
    const H = book.pageHeight;
    const x0 = book.root.position.x;
    let left = 0;
    let right = 0;
    for (const leaf of book.leaves) {
      left = Math.max(left, smoothstep(0.8, 1, leaf.progress));
      right = Math.max(right, smoothstep(0.8, 1, 1 - leaf.progress));
    }
    const strength = this.spec.color && new Color(this.spec.color).getHSL({ h: 0, s: 0, l: 0 }).l < 0.35 ? 0.7 : 0.5;
    const [l, r] = this.contact;
    for (const [mesh, side, presence] of [
      [l, -1, left],
      [r, 1, right],
    ] as const) {
      mesh.visible = presence > 0.001;
      mesh.position.x = x0 + (side * W) / 2;
      mesh.scale.set(W * 1.3, H * 1.3, 1);
      mesh.material.opacity = presence * strength;
    }
  }

  dispose(): void {
    this.floor.geometry.dispose();
    this.floor.material.dispose();
    this.surfaceMap?.dispose();
    for (const c of this.contact) {
      c.geometry.dispose();
      c.material.map?.dispose();
      c.material.dispose();
    }
    this.key.shadow.map?.dispose();
  }
}
