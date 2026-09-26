import {
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  PlaneGeometry,
  ShadowMaterial,
  SRGBColorSpace,
  type Scene,
} from 'three';

type Vec3 = readonly [number, number, number];

interface LightSpec {
  color: string;
  intensity: number;
  position: Vec3;
}

export interface LightingPreset {
  id: string;
  label: string;
  hemi: { sky: string; ground: string; intensity: number };
  key: LightSpec & { shadowRadius: number };
  fill: LightSpec;
  rim: LightSpec;
  /** Opacidad de la sombra sobre la mesa / fondo. */
  shadow: number;
}

export const LIGHTING_PRESETS: readonly LightingPreset[] = [
  {
    id: 'estudio',
    label: 'Estudio',
    hemi: { sky: '#ffffff', ground: '#b9b2a6', intensity: 1.55 },
    key: { color: '#fff6ea', intensity: 2.1, position: [-3.5, 9, 5], shadowRadius: 4 },
    fill: { color: '#dfe8ff', intensity: 0.35, position: [5, 4, -3] },
    rim: { color: '#ffffff', intensity: 0, position: [0, 4, -8] },
    shadow: 0.28,
  },
  {
    id: 'calida',
    label: 'Cálida',
    hemi: { sky: '#fff1e2', ground: '#7a6a5a', intensity: 1.5 },
    key: { color: '#ffd2a0', intensity: 2.7, position: [-7, 5, 3], shadowRadius: 7 },
    fill: { color: '#c3cfff', intensity: 0.3, position: [6, 3, -2] },
    rim: { color: '#ffd29a', intensity: 0.5, position: [3, 3, -7] },
    shadow: 0.38,
  },
  {
    id: 'dramatica',
    label: 'Dramática',
    hemi: { sky: '#ffffff', ground: '#1e1c1a', intensity: 0.45 },
    key: { color: '#fff0de', intensity: 3.8, position: [-6, 5, -1.2], shadowRadius: 2 },
    fill: { color: '#dfe8ff', intensity: 0.08, position: [5, 4, 3] },
    rim: { color: '#cfe0ff', intensity: 1.4, position: [4, 3, -6] },
    shadow: 0.5,
  },
  {
    id: 'suave',
    label: 'Suave',
    hemi: { sky: '#ffffff', ground: '#d8d2c8', intensity: 2.3 },
    key: { color: '#ffffff', intensity: 1.25, position: [-2, 9, 6], shadowRadius: 10 },
    fill: { color: '#ffffff', intensity: 0.45, position: [5, 5, -2] },
    rim: { color: '#ffffff', intensity: 0, position: [0, 4, -8] },
    shadow: 0.18,
  },
  {
    id: 'fria',
    label: 'Fría',
    hemi: { sky: '#e4efff', ground: '#8894a8', intensity: 1.4 },
    key: { color: '#dbe8ff', intensity: 2.3, position: [4, 8, 4], shadowRadius: 5 },
    fill: { color: '#ffeedd', intensity: 0.3, position: [-5, 3, -2] },
    rim: { color: '#bcd4ff', intensity: 0.7, position: [-3, 3, -7] },
    shadow: 0.3,
  },
];

export interface Backdrop {
  /** Color del centro y del borde del degradé radial. */
  inner: string;
  outer: string;
}

export const BACKDROP_PRESETS: readonly (Backdrop & { id: string; label: string })[] = [
  { id: 'carbon', label: 'Carbón', inner: '#3d3832', outer: '#161412' },
  { id: 'crema', label: 'Crema', inner: '#f6f0e5', outer: '#d6ccbc' },
  { id: 'rosa', label: 'Rosa', inner: '#fbdde3', outer: '#dfa3b0' },
  { id: 'salvia', label: 'Salvia', inner: '#e1e8da', outer: '#a3b39b' },
  { id: 'noche', label: 'Noche', inner: '#2a3552', outer: '#0c1020' },
  { id: 'blanco', label: 'Blanco', inner: '#ffffff', outer: '#e4e4e4' },
];

/** Degradé a partir de un único color elegido por el usuario. */
export function backdropFromColor(hex: string): Backdrop {
  const base = new Color(hex);
  return { inner: `#${base.clone().lerp(new Color('#ffffff'), 0.18).getHexString()}`, outer: `#${base.clone().multiplyScalar(0.62).getHexString()}` };
}

/**
 * Iluminación y fondo. Separado del libro para cambiar la estética (luces,
 * sombras, entorno) sin tocar la lógica de páginas.
 */
export class Stage {
  readonly group = new Group();
  readonly key: DirectionalLight;
  readonly ground: Mesh<PlaneGeometry, ShadowMaterial>;
  private readonly hemi: HemisphereLight;
  private readonly fill: DirectionalLight;
  private readonly rim: DirectionalLight;
  private backdropTexture: CanvasTexture | null = null;
  lighting: LightingPreset = LIGHTING_PRESETS[0];

  constructor() {
    this.hemi = new HemisphereLight();
    this.key = new DirectionalLight();
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.015;
    this.fill = new DirectionalLight();
    this.rim = new DirectionalLight();
    this.group.add(this.hemi, this.key, this.key.target, this.fill, this.rim);

    this.ground = new Mesh(new PlaneGeometry(60, 60), new ShadowMaterial({ opacity: 0.28 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.002;
    this.ground.receiveShadow = true;
    this.group.add(this.ground);

    this.setLighting('estudio');
  }

  setLighting(id: string): void {
    const preset = LIGHTING_PRESETS.find((p) => p.id === id) ?? LIGHTING_PRESETS[0];
    this.lighting = preset;
    this.hemi.color.set(preset.hemi.sky);
    this.hemi.groundColor.set(preset.hemi.ground);
    this.hemi.intensity = preset.hemi.intensity;
    for (const [light, spec] of [
      [this.key, preset.key],
      [this.fill, preset.fill],
      [this.rim, preset.rim],
    ] as const) {
      light.color.set(spec.color);
      light.intensity = spec.intensity;
      light.position.set(...spec.position);
      light.visible = spec.intensity > 0;
    }
    this.key.shadow.radius = preset.key.shadowRadius;
    this.ground.material.opacity = preset.shadow;
  }

  /** Fondo dentro de la escena (sale en fotos y videos). null = transparente. */
  setBackdrop(scene: Scene, backdrop: Backdrop | null): void {
    this.backdropTexture?.dispose();
    this.backdropTexture = null;
    if (!backdrop) {
      scene.background = null;
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(256, 210, 0, 256, 256, 400);
    gradient.addColorStop(0, backdrop.inner);
    gradient.addColorStop(1, backdrop.outer);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 512);
    this.backdropTexture = new CanvasTexture(canvas);
    this.backdropTexture.colorSpace = SRGBColorSpace;
    scene.background = this.backdropTexture;
  }

  /** Ajusta la cámara de sombras al tamaño del libro abierto. */
  fitShadow(halfWidth: number, halfDepth: number): void {
    const cam = this.key.shadow.camera;
    const reach = Math.max(halfWidth, halfDepth) * 1.35;
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
    this.backdropTexture?.dispose();
  }
}
