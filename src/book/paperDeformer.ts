import type { BufferAttribute, BufferGeometry } from 'three';

/**
 * Pose de una hoja. El giro se mide en el lomo; la curvatura se reparte a lo
 * ancho de la hoja según un perfil, de modo que la hoja nunca se estira:
 * cada fila es una curva de longitud constante (integración por longitud de arco).
 */
export interface LeafPose {
  /** Ángulo en el lomo: 0 = apoyada a la derecha, π = apoyada a la izquierda. */
  angle: number;
  /** Radianes extra que gira el borde libre respecto del lomo (>0: el borde adelanta). */
  curl: number;
  /**
   * Torsión (rad): el ángulo en el lomo varía con la altura, `angle + twist·yN`
   * (fila de abajo yN = −1 … arriba +1).
   */
  twist: number;
  /** Variación de la curvatura con la altura: `curl + curlTwist·yN`. */
  curlTwist: number;
}

export const FLAT_RIGHT: LeafPose = { angle: 0, curl: 0, twist: 0, curlTwist: 0 };

/** Perfil de curvatura acumulada w(t): w(0)=0, w(1)=1, monótono. t = distancia al lomo / ancho. */
export type CurlProfile = (t: number) => number;

/** Curvatura creciente hacia el borde, como el papel cuando se levanta de la punta. */
export const defaultCurlProfile: CurlProfile = (t) => t * t * (1.6 - 0.6 * t);

/** Curvatura efectiva de una fila, con topes para que todo φ quede en [0, π] y la hoja no atraviese las pilas. */
export function clampBend(angle: number, bend: number, maxCurl: number): number {
  const maxLead = Math.min(Math.PI - angle, maxCurl);
  const maxLag = Math.min(angle, maxCurl);
  return Math.max(-maxLag, Math.min(maxLead, bend));
}

/** Ángulo en el lomo y curvatura de la fila a altura normalizada yN (−1 abajo … +1 arriba). */
export function rowShape(pose: LeafPose, yN: number, maxCurl: number): { angle: number; bend: number } {
  const angle = Math.max(0, Math.min(Math.PI, pose.angle + pose.twist * yN));
  return { angle, bend: clampBend(angle, pose.curl + pose.curlTwist * yN, maxCurl) };
}

/** Pose atenuada por la rigidez del material (tapas de cartón: flex ≈ 0). */
export function flexPose(pose: LeafPose, flex: number): LeafPose {
  return { angle: pose.angle, curl: pose.curl * flex, twist: pose.twist * flex, curlTwist: pose.curlTwist * flex };
}

/**
 * Distancia horizontal al lomo (en anchos de página) del punto de una fila que
 * está a la fracción `t` del ancho, para un ángulo y una curvatura dados.
 */
export function projectedReach(angle: number, bend: number, t: number, profile = defaultCurlProfile, steps = 32): number {
  const ds = t / steps;
  let x = 0;
  for (let i = 0; i < steps; i++) x += Math.cos(angle + bend * profile((i + 0.5) * ds)) * ds;
  return x;
}

/**
 * Deforma la geometría de una hoja (BoxGeometry trasladada a x ∈ [0, ancho]).
 * La geometría plana se toma como referencia al construir; `apply` reescribe
 * posiciones y normales en el sitio.
 */
export class PaperDeformer {
  private readonly base: Float32Array;
  private readonly vertexCol: Uint16Array;
  private readonly vertexRow: Uint16Array;
  private readonly cols: number;
  private readonly rows: number;
  private readonly weights: Float32Array;
  private readonly midWeights: Float32Array;
  private readonly curveX: Float32Array;
  private readonly curveZ: Float32Array;
  private readonly curvePhi: Float32Array;

  constructor(
    private readonly geometry: BufferGeometry,
    private readonly width: number,
    height: number,
    segmentsX: number,
    segmentsY: number,
    profile: CurlProfile = defaultCurlProfile,
  ) {
    const position = geometry.getAttribute('position') as BufferAttribute;
    this.base = Float32Array.from(position.array as Float32Array);
    this.cols = segmentsX + 1;
    this.rows = segmentsY + 1;

    // Cada vértice de la BoxGeometry cae exactamente sobre la grilla (col, fila).
    const count = position.count;
    this.vertexCol = new Uint16Array(count);
    this.vertexRow = new Uint16Array(count);
    for (let v = 0; v < count; v++) {
      const x = this.base[v * 3];
      const y = this.base[v * 3 + 1];
      this.vertexCol[v] = Math.round((x / width) * segmentsX);
      this.vertexRow[v] = Math.round((y / height + 0.5) * segmentsY);
    }

    this.weights = new Float32Array(this.cols);
    this.midWeights = new Float32Array(segmentsX);
    for (let i = 0; i < this.cols; i++) this.weights[i] = profile(i / segmentsX);
    for (let i = 0; i < segmentsX; i++) this.midWeights[i] = profile((i + 0.5) / segmentsX);

    const cells = this.cols * this.rows;
    this.curveX = new Float32Array(cells);
    this.curveZ = new Float32Array(cells);
    this.curvePhi = new Float32Array(cells);
  }

  /**
   * @param pivotZ altura del lomo de esta hoja sobre la base del libro.
   * @param maxCurl tope absoluto de curvatura (rad).
   */
  apply(pose: LeafPose, pivotZ: number, maxCurl: number): void {
    const { cols, rows, width, weights, midWeights, curveX, curveZ, curvePhi } = this;
    const dx = width / (cols - 1);

    for (let r = 0; r < rows; r++) {
      const yN = rows > 1 ? (r / (rows - 1)) * 2 - 1 : 0;
      const { angle: rowAngle, bend } = rowShape(pose, yN, maxCurl);
      const o = r * cols;
      let x = 0;
      let z = 0;
      curveX[o] = 0;
      curveZ[o] = 0;
      curvePhi[o] = rowAngle;
      for (let i = 1; i < cols; i++) {
        const phiMid = rowAngle + bend * midWeights[i - 1];
        x += Math.cos(phiMid) * dx;
        z += Math.sin(phiMid) * dx;
        curveX[o + i] = x;
        curveZ[o + i] = z;
        curvePhi[o + i] = rowAngle + bend * weights[i];
      }
    }

    const position = this.geometry.getAttribute('position') as BufferAttribute;
    const out = position.array as Float32Array;
    const base = this.base;
    for (let v = 0, n = position.count; v < n; v++) {
      const cell = this.vertexRow[v] * cols + this.vertexCol[v];
      const offset = base[v * 3 + 2]; // espesor: desplazamiento sobre la normal
      const phi = curvePhi[cell];
      out[v * 3] = curveX[cell] - Math.sin(phi) * offset;
      out[v * 3 + 1] = base[v * 3 + 1];
      out[v * 3 + 2] = pivotZ + curveZ[cell] + Math.cos(phi) * offset;
    }
    position.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }
}
