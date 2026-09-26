import { CanvasTexture, MeshStandardMaterial, SRGBColorSpace, type Texture } from 'three';

export interface PaperMaterialOptions {
  /** Coordenada u donde está el lomo en esta cara (0 en el frente, 1 en el dorso). */
  spineAtU: 0 | 1;
  /** Oscurecimiento máximo junto al lomo (0 = sin sombra de encuadernación). */
  gutterStrength: number;
  /** Ancho de la sombra de encuadernación, en fracción del ancho de página. */
  gutterWidth: number;
  roughness: number;
}

export type PaperMaterial = MeshStandardMaterial & {
  userData: { uniforms: Record<'uSpineU' | 'uGutterStrength' | 'uGutterWidth', { value: number }> };
};

let blankPaper: Texture | null = null;

/** Textura de papel liso compartida mientras la página real carga. */
export function blankPaperTexture(): Texture {
  if (!blankPaper) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 4;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#f3efe6';
    ctx.fillRect(0, 0, 4, 4);
    blankPaper = new CanvasTexture(canvas);
    blankPaper.colorSpace = SRGBColorSpace;
  }
  return blankPaper;
}

/**
 * Material de una cara de hoja: PBR estándar + sombra de encuadernación
 * calculada en el shader (no se "hornea" en la textura, así se puede ajustar en
 * vivo). Punto de extensión natural para brillo, textura de papel, etc.
 */
export function createPaperMaterial(options: PaperMaterialOptions): PaperMaterial {
  const material = new MeshStandardMaterial({
    map: blankPaperTexture(),
    roughness: options.roughness,
    metalness: 0,
  }) as PaperMaterial;

  material.userData.uniforms = {
    uSpineU: { value: options.spineAtU },
    uGutterStrength: { value: options.gutterStrength },
    uGutterWidth: { value: options.gutterWidth },
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, material.userData.uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uSpineU;
uniform float uGutterStrength;
uniform float uGutterWidth;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  float spineDist = abs(vMapUv.x - uSpineU);
  float gutter = 1.0 - smoothstep(0.0, uGutterWidth, spineDist);
  diffuseColor.rgb *= 1.0 - uGutterStrength * gutter * gutter;
}`,
      );
  };
  // Todas las caras comparten el mismo programa; los uniforms son por material.
  material.customProgramCacheKey = () => 'paper-v1';
  return material;
}
