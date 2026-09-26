/**
 * Cámara en coordenadas "de fotógrafo" alrededor de un punto: azimut (grados,
 * 0 = de frente al pie de las páginas, + hacia la derecha), elevación sobre la
 * mesa (grados) y distancia. El libro yace en el plano XZ del mundo, lomo sobre
 * el eje Z, página derecha en x > 0.
 */
export interface CamPose {
  azimuth: number;
  elevation: number;
  distance: number;
  target: readonly [number, number, number];
}

export interface Region {
  /** Extensión en X (a lo ancho del libro) y Z (alto de página), en unidades de escena. */
  width: number;
  depth: number;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

export function posePosition(pose: CamPose): [number, number, number] {
  const az = rad(pose.azimuth);
  const el = rad(Math.min(pose.elevation, 86)); // 90° exacto degenera lookAt
  const [tx, ty, tz] = pose.target;
  return [
    tx + pose.distance * Math.sin(az) * Math.cos(el),
    ty + pose.distance * Math.sin(el),
    tz + pose.distance * Math.cos(az) * Math.cos(el),
  ];
}

export function lerpPose(a: CamPose, b: CamPose, t: number): CamPose {
  const mix = (x: number, y: number) => x + (y - x) * t;
  return {
    azimuth: mix(a.azimuth, b.azimuth),
    elevation: mix(a.elevation, b.elevation),
    distance: mix(a.distance, b.distance),
    target: [mix(a.target[0], b.target[0]), mix(a.target[1], b.target[1]), mix(a.target[2], b.target[2])],
  };
}

/**
 * Distancia a la que una región rectangular del plano del libro entra en el
 * cuadro visto desde (azimut, elevación). Aproximación ortográfica con margen.
 */
export function fitDistance(
  region: Region,
  view: { azimuth: number; elevation: number },
  vFovDeg: number,
  aspect: number,
  margin = 1.12,
): number {
  const az = rad(view.azimuth);
  const el = rad(Math.min(view.elevation, 86));
  const across = Math.abs(region.width * Math.cos(az)) + Math.abs(region.depth * Math.sin(az));
  const along = Math.abs(region.width * Math.sin(az)) + Math.abs(region.depth * Math.cos(az));
  const vertical = along * Math.sin(el) + 0.15 * Math.cos(el);
  const tanV = Math.tan(rad(vFovDeg) / 2);
  const tanH = tanV * aspect;
  return Math.max(across / 2 / tanH, vertical / 2 / tanV) * margin;
}
