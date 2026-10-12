import {
  Color,
  HalfFloatType,
  NearestFilter,
  NoBlending,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type Camera,
  type Scene,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';

/**
 * Profundidad de campo sin halos, en una sola pasada (técnica de Dennis
 * Gustafsson, "Bokeh depth of field in a single pass", 2018).
 *
 * Reemplaza a BokehPass de three.js, que tiene dos defectos visibles en fotos de
 * producto: el fondo de la escena (una textura) se dibuja dentro del buffer de
 * profundidad y queda como si estuviera pegado a la cámara, y cada píxel se
 * desenfoca sólo según su propia distancia, así lo nítido y claro (las páginas)
 * se "derrama" sobre el fondo desenfocado: un halo brillante alrededor del libro.
 *
 * Acá cada muestra aporta según su propio círculo de confusión, y lo que está
 * detrás no puede desparramarse sobre lo que está delante y en foco.
 */

const depthMaterial = () =>
  new ShaderMaterial({
    // Inversa de la distancia de vista: 0 = infinito (el color de borrado).
    vertexShader: /* glsl */ `
      varying float vViewZ;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewZ = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vViewZ;
      void main() { gl_FragColor = vec4(1.0 / max(vViewZ, 1e-3), 0.0, 0.0, 1.0); }`,
    blending: NoBlending,
  });

const dofMaterial = () =>
  new ShaderMaterial({
    uniforms: {
      tColor: { value: null },
      tDepth: { value: null },
      uTexel: { value: new Vector2() },
      uFocusInv: { value: 0.2 },
      uMaxBlur: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tColor;
      uniform sampler2D tDepth;
      uniform vec2 uTexel;
      uniform float uFocusInv;
      uniform float uMaxBlur;
      varying vec2 vUv;
      const float GOLDEN_ANGLE = 2.39996323;
      const float RAD_SCALE = 0.75;

      // Círculo de confusión (px) de una lente delgada: proporcional a |1 − foco/distancia|.
      float coc(float inv) {
        return min(1.0, abs(1.0 - inv / uFocusInv)) * uMaxBlur;
      }

      void main() {
        float centerInv = texture2D(tDepth, vUv).r;
        float centerSize = coc(centerInv);
        vec4 base = texture2D(tColor, vUv);
        vec3 color = base.rgb;
        float total = 1.0;
        float radius = RAD_SCALE;
        float angle = 0.0;
        for (int i = 0; i < 1024; i++) {
          if (radius >= uMaxBlur) break;
          vec2 uv = vUv + vec2(cos(angle), sin(angle)) * uTexel * radius;
          vec3 sampleColor = texture2D(tColor, uv).rgb;
          float sampleInv = texture2D(tDepth, uv).r;
          float sampleSize = coc(sampleInv);
          // Lo de atrás no se derrama sobre lo que está delante y nítido.
          if (sampleInv < centerInv) sampleSize = clamp(sampleSize, 0.0, centerSize * 2.0);
          float m = smoothstep(radius - 0.5, radius + 0.5, sampleSize);
          color += mix(color / total, sampleColor, m);
          total += 1.0;
          radius += RAD_SCALE / radius;
          angle += GOLDEN_ANGLE;
        }
        gl_FragColor = vec4(color / total, base.a);
      }`,
    depthTest: false,
    depthWrite: false,
  });

export class DofPass extends Pass {
  /** Distancia de la cámara al plano de foco (unidades de escena). */
  focus = 5;
  /** Desenfoque máximo (fondo infinito) en píxeles. 0 = apagado. */
  maxBlur = 0;

  private readonly depthTarget = new WebGLRenderTarget(1, 1, { type: HalfFloatType, minFilter: NearestFilter, magFilter: NearestFilter });
  private readonly depthOverride = depthMaterial();
  private readonly material = dofMaterial();
  private readonly quad = new FullScreenQuad(this.material);
  private readonly savedClear = new Color();

  constructor(
    private readonly scene: Scene,
    private readonly camera: Camera,
  ) {
    super();
  }

  setSize(width: number, height: number): void {
    this.depthTarget.setSize(width, height);
    (this.material.uniforms.uTexel.value as Vector2).set(1 / width, 1 / height);
  }

  render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget, readBuffer: WebGLRenderTarget): void {
    // 1) Profundidad de la escena real: sin fondo ni niebla (el borrado en 0 = infinito).
    const { scene } = this;
    const background = scene.background;
    const autoClear = renderer.autoClear;
    const clearAlpha = renderer.getClearAlpha();
    const clearColor = renderer.getClearColor(this.savedClear);
    scene.background = null;
    scene.overrideMaterial = this.depthOverride;
    renderer.autoClear = false;
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(this.depthTarget);
    renderer.clear();
    renderer.render(scene, this.camera);
    scene.overrideMaterial = null;
    scene.background = background;

    // 2) Desenfoque.
    const u = this.material.uniforms;
    u.tColor.value = readBuffer.texture as Texture;
    u.tDepth.value = this.depthTarget.texture;
    u.uFocusInv.value = 1 / Math.max(0.05, this.focus);
    u.uMaxBlur.value = this.maxBlur;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (!this.renderToScreen) renderer.clear();
    this.quad.render(renderer);

    renderer.setClearColor(clearColor, clearAlpha);
    renderer.autoClear = autoClear;
  }

  dispose(): void {
    this.depthTarget.dispose();
    this.depthOverride.dispose();
    this.material.dispose();
    this.quad.dispose();
  }
}
