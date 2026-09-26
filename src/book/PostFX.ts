import { HalfFloatType, WebGLRenderTarget, type PerspectiveCamera, type Scene, type WebGLRenderer } from 'three';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/** Ajustes de "look" fotográfico. Todos 0..1 salvo que se indique. */
export interface LookSettings {
  /** Profundidad de campo (desenfoque fuera del plano de foco). 0 = apagada. */
  aperture: number;
  vignette: number;
  grain: number;
  /** Fundido a negro. */
  fade: number;
  /** Destello a blanco (cortes). */
  flash: number;
  /** Barrido de luz diagonal: posición (0 → 1 cruza el cuadro) e intensidad. */
  sweep: number;
  sweepStrength: number;
}

export const NEUTRAL_LOOK: LookSettings = { aperture: 0, vignette: 0, grain: 0, fade: 0, flash: 0, sweep: 0, sweepStrength: 0 };

/** Viñeta, grano, barrido de luz y fundidos, sobre la imagen ya en sRGB. */
const LookShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0 },
    uGrain: { value: 0 },
    uFade: { value: 0 },
    uFlash: { value: 0 },
    uSweep: { value: 0 },
    uSweepStrength: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uGrain, uFade, uFlash, uSweep, uSweepStrength;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      // Viñeta elíptica que sigue el cuadro (esquinas a distancia √2).
      float edge = smoothstep(0.55, 1.45, length((vUv - 0.5) * 2.0));
      color.rgb *= 1.0 - uVignette * 0.85 * edge;
      float band = (vUv.x * 0.8 + vUv.y) * 0.62 - (uSweep * 1.6 - 0.3);
      color.rgb += uSweepStrength * exp(-band * band * 90.0) * vec3(1.0, 0.93, 0.82) * 0.55;
      color.rgb += (hash(vUv * vec2(1733.0, 911.0) + fract(uTime)) - 0.5) * uGrain * 0.11;
      color.rgb = mix(color.rgb, vec3(1.0), uFlash);
      color.rgb = mix(color.rgb, vec3(0.0), uFade);
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
  private readonly bokeh: BokehPass;
  private readonly look: ShaderPass;
  private settings: LookSettings = { ...NEUTRAL_LOOK };

  constructor(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera) {
    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bokeh = new BokehPass(scene, camera, { focus: 8, aperture: 0, maxblur: 0.012 });
    this.composer.addPass(this.bokeh);
    this.composer.addPass(new OutputPass());
    this.look = new ShaderPass(LookShader);
    this.composer.addPass(this.look);
  }

  /** Tamaño en píxeles reales del destino. */
  setSize(width: number, height: number): void {
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
    this.bokeh.enabled = s.aperture > 0.001;
    const bokeh = this.bokeh.uniforms as Record<'focus' | 'aperture', { value: number }>;
    bokeh.focus.value = focusDistance;
    // Desenfoque proporcional a la distancia relativa al foco: igual en planos cortos y largos.
    bokeh.aperture.value = (0.032 * s.aperture) / Math.max(0.5, focusDistance);
    const u = this.look.uniforms;
    u.uTime.value = time;
    u.uVignette.value = s.vignette;
    u.uGrain.value = s.grain;
    u.uFade.value = s.fade;
    u.uFlash.value = s.flash;
    u.uSweep.value = s.sweep;
    u.uSweepStrength.value = s.sweepStrength;
    this.composer.render();
  }

  dispose(): void {
    this.composer.dispose();
    this.bokeh.dispose();
  }
}
