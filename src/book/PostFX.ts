import { Color, HalfFloatType, LinearSRGBColorSpace, WebGLRenderTarget, type PerspectiveCamera, type Scene, type WebGLRenderer } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { DofPass } from './DofPass';

/** Ajustes de "look" fotográfico. Todos 0..1 salvo que se indique. */
export interface LookSettings {
  /** Profundidad de campo (desenfoque fuera del plano de foco). 0 = apagada. */
  aperture: number;
  vignette: number;
  grain: number;
  /** Fundido hacia `fadeColor`. */
  fade: number;
  /** Color del fundido (hex). */
  fadeColor: string;
}

export const NEUTRAL_LOOK: LookSettings = { aperture: 0, vignette: 0, grain: 0, fade: 0, fadeColor: '#000000' };

/**
 * Viñeta, grano y fundido, sobre la imagen ya en sRGB. A propósito no hay
 * destellos ni barridos de luz pintados encima: el brillo lo dan las luces reales.
 */
const LookShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0 },
    uGrain: { value: 0 },
    uFade: { value: 0 },
    uFadeColor: { value: new Color(0, 0, 0) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uGrain, uFade;
    uniform vec3 uFadeColor;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      // Viñeta elíptica que sigue el cuadro (esquinas a distancia √2).
      float edge = smoothstep(0.55, 1.45, length((vUv - 0.5) * 2.0));
      color.rgb *= 1.0 - uVignette * 0.85 * edge;
      color.rgb += (hash(vUv * vec2(1733.0, 911.0) + fract(uTime)) - 0.5) * uGrain * 0.11;
      color.rgb = mix(color.rgb, uFadeColor, uFade);
      gl_FragColor = color;
    }`,
};

/**
 * Cadena de post-proceso para fotos y videos: render con MSAA → profundidad
 * de campo → tone mapping/sRGB → look. En la navegación normal no se usa
 * (render directo, más liviano).
 */
export class PostFX {
  readonly composer: EffectComposer;
  private readonly dof: DofPass;
  private readonly look: ShaderPass;
  private settings: LookSettings = { ...NEUTRAL_LOOK };
  private shortSide = 1;

  constructor(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera) {
    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.dof = new DofPass(scene, camera);
    this.composer.addPass(this.dof);
    this.composer.addPass(new OutputPass());
    this.look = new ShaderPass(LookShader);
    this.composer.addPass(this.look);
  }

  /** Tamaño en píxeles reales del destino. */
  setSize(width: number, height: number): void {
    this.shortSide = Math.max(1, Math.min(width, height));
    this.composer.setPixelRatio(1);
    this.composer.setSize(width, height);
  }

  set(settings: Partial<LookSettings>): void {
    Object.assign(this.settings, settings);
  }

  get current(): Readonly<LookSettings> {
    return this.settings;
  }

  /** @param focusDistance distancia de la cámara al plano de foco (unidades de escena). */
  render(focusDistance: number, time: number): void {
    const s = this.settings;
    // El desenfoque máximo escala con la resolución: la misma foto en 2K y 4K se ve igual.
    this.dof.enabled = s.aperture > 0.001;
    this.dof.focus = focusDistance;
    this.dof.maxBlur = s.aperture * 0.02 * this.shortSide;
    const u = this.look.uniforms;
    u.uTime.value = time;
    u.uVignette.value = s.vignette;
    u.uGrain.value = s.grain;
    u.uFade.value = s.fade;
    // El shader trabaja sobre la imagen ya en sRGB: el color va sin convertir.
    (u.uFadeColor.value as Color).setStyle(s.fadeColor, LinearSRGBColorSpace);
    this.composer.render();
  }

  dispose(): void {
    this.composer.dispose();
    this.dof.dispose();
  }
}
