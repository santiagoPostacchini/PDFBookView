import {
  CanvasTexture,
  BoxGeometry,
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
  table?: boolean;
  tableSize?: { width: number; depth: number };
  windowStrength?: number;
  /** Mantel tejido, con dibujo repetido en coordenadas de la mesa. */
  cloth?: { tablecloth?: 'vichy-rosa' | 'vichy-azul' | 'rayas-salvia'; color: string; surface?: Surface; ink?: string };
  /** Marco de ventana proyectado por el foco sobre el libro y la superficie. */
  windowShadow?: boolean;
  /** Color exacto del fondo; independiente del mantel. */
  color: string;
  surface: Surface;
  /** Campo histórico; fondo y niebla usan color. */
  horizon?: string;
}

export { SCENARIOS as SET_PRESETS } from './scenarios';

function windowTexture(strength: number): Texture {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 256, 256);
  ctx.filter = 'blur(4px)';
  const shade = Math.round(255 * (1 - strength * 0.85));
  ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
  ctx.fillRect(82, 0, 9, 256); ctx.fillRect(165, 0, 9, 256); ctx.fillRect(0, 124, 256, 10);
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
  return texture;
}

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
function surfaceTexture(surface: Surface, tablecloth?: NonNullable<StageSetSpec['cloth']>['tablecloth'], inkColor?: string): Texture | null {
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
  const ink = inkColor ? new Color(inkColor).toArray() : tablecloth === 'vichy-rosa' ? [0.76, 0.40, 0.48] : tablecloth === 'vichy-azul' ? [0.36, 0.53, 0.72] : [0.44, 0.60, 0.43];
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
      if (tablecloth) {
        // Ocho cuadros por mosaico: unos diez cuadros por página. Al cruzar
        // los hilos teñidos, la intersección toma un tono más fuerte.
        const vertical = Math.floor(x / 64) % 2;
        const horizontal = Math.floor(y / 64) % 2;
        const dye = tablecloth === 'rayas-salvia' ? vertical * 0.65 : (vertical + horizontal) * 0.34;
        for (let channel = 0; channel < 3; channel++) data[i + channel] = Math.round(c * (1 - dye * (1 - ink[channel])));
      }
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
  private tablecloth: NonNullable<StageSetSpec['cloth']>['tablecloth'];
  private ink?: string;
  private windowMap: Texture | null = null;
  private windowStrength = -1;
  private readonly tabletop: Mesh<BoxGeometry, MeshStandardMaterial>;
  private readonly legs: Mesh<BoxGeometry, MeshStandardMaterial>[];
  private readonly ground: Mesh<PlaneGeometry, MeshStandardMaterial>;
  spec: StageSetSpec | null = null;

  constructor(group: Group) {
    this.floor = new Mesh(new PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE), new MeshStandardMaterial({ roughness: 0.92, metalness: 0 }));
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -0.004;
    this.floor.receiveShadow = true;
    this.floor.visible = false;
    // El mantel es la única cara superior: quitar la tapa de madera evita
    // competencia de profundidad incluso en el pase de normales de SSAO.
    const body = new BoxGeometry(1, 1, 1);
    const top = body.groups.find((g) => g.materialIndex === 2)!;
    body.setIndex(Array.from(body.index!.array).filter((_, i) => i < top.start || i >= top.start + top.count));
    body.clearGroups();
    this.tabletop = new Mesh(body, new MeshStandardMaterial({ color: '#957353', roughness: 0.82 }));
    this.tabletop.position.y = this.floor.position.y - 0.17 / 2;
    this.tabletop.castShadow = this.tabletop.receiveShadow = true;
    this.legs = Array.from({ length: 4 }, () => {
      const leg = new Mesh(new BoxGeometry(0.18, 2.7, 0.18), new MeshStandardMaterial({ color: '#795b40', roughness: 0.85 }));
      leg.position.y = -1.5; leg.castShadow = leg.receiveShadow = true; return leg;
    });
    this.ground = new Mesh(new PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE), new MeshStandardMaterial({ color: '#b8ada0', roughness: 1 }));
    this.ground.rotation.x = -Math.PI / 2; this.ground.position.y = -2.86; this.ground.receiveShadow = true;
    for (const mesh of [this.tabletop, ...this.legs, this.ground]) mesh.visible = false;

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
    group.add(this.floor, this.tabletop, ...this.legs, this.ground, ...this.contact, this.key, this.key.target);
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
    for (const mesh of [this.tabletop, ...this.legs, this.ground]) mesh.visible = on && !!spec?.table;
    if (!spec) {
      this.key.map = null;
      scene.fog = null;
      return;
    }
    const strength = Math.max(0, Math.min(1, spec.windowStrength ?? 0.45));
    if (spec.windowShadow && (!this.windowMap || strength !== this.windowStrength)) {
      this.windowMap?.dispose(); this.windowMap = windowTexture(strength); this.windowStrength = strength;
    }
    this.key.map = spec.windowShadow ? this.windowMap : null;
    const cloth = spec.table ? spec.cloth : undefined;
    const surface = spec.table ? (cloth?.surface ?? spec.surface) : 'liso';
    if (surface !== this.surface || cloth?.tablecloth !== this.tablecloth || cloth?.ink !== this.ink) {
      this.surfaceMap?.dispose();
      this.surfaceMap = surfaceTexture(surface, cloth?.tablecloth, cloth?.ink);
      this.surface = surface;
      this.tablecloth = cloth?.tablecloth;
      this.ink = cloth?.ink;
    }
    const material = this.floor.material;
    material.color.set(cloth?.color ?? spec.color);
    material.map = this.surfaceMap;
    material.needsUpdate = true;
    // Fondo y niebla conservan el color elegido, sin oscurecerlo.
    const horizon = new Color(spec.color);
    this.ground.material.color.set(spec.color);
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
    const width = this.spec.table ? Math.max(7, W * 3.8, this.spec.tableSize?.width ?? 0) : FLOOR_SIZE;
    const depth = this.spec.table ? Math.max(6, H * 2.2, this.spec.tableSize?.depth ?? 0) : FLOOR_SIZE;
    this.floor.scale.set(width / FLOOR_SIZE, depth / FLOOR_SIZE, 1);
    this.surfaceMap?.repeat.set(width / TILE, depth / TILE);
    this.tabletop.scale.set(width, 0.17, depth);
    this.legs.forEach((leg, i) => { leg.position.x = (i % 2 ? 1 : -1) * (width / 2 - 0.35); leg.position.z = (i < 2 ? 1 : -1) * (depth / 2 - 0.35); });
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
    for (const mesh of [this.tabletop, ...this.legs, this.ground]) { mesh.geometry.dispose(); mesh.material.dispose(); }
    this.floor.geometry.dispose();
    this.floor.material.dispose();
    this.surfaceMap?.dispose();
    this.windowMap?.dispose();
    for (const c of this.contact) {
      c.geometry.dispose();
      c.material.map?.dispose();
      c.material.dispose();
    }
    this.key.shadow.map?.dispose();
  }
}
