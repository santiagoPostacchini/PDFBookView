import { Quaternion, Vector3 } from 'three';
import type { CamPose } from '../../studio/framing';
import { evaluateShow, type Pose, type StickerShow } from './choreography';

/** Envolvente de entrada, boca, vuelos, aleta y mazo; conserva la coreografía. */
export function showPoints(show: StickerShow, time: number): Vector3[] {
  const points: Vector3[] = [];
  const box = (pose: Pose, width: number, height: number, depth: number) => {
    if (!pose.visible) return;
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1])
      points.push(new Vector3(x * width / 2, y * height / 2, z * depth / 2).applyQuaternion(pose.rotation).add(pose.position));
  };
  const poses = evaluateShow(show, time, (page) => new Vector3(page % 2 ? -show.width / 2 : show.width / 2, 0.1, 0));
  for (const pack of [poses.pack, ...poses.companions]) box(pack, show.packWidth, show.packHeight, show.packWidth * 0.08);
  const hinge = new Vector3(0, show.packHeight / 2, -show.packWidth * 0.04);
  const flapRotation = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), poses.flap);
  for (const x of [-1, 1]) for (const y of [0, 1]) {
    points.push(new Vector3(x * show.packWidth * 0.48, y * show.packHeight * 0.12, 0)
      .applyQuaternion(flapRotation).add(hinge).applyQuaternion(poses.pack.rotation).add(poses.pack.position));
  }
  poses.stickers.forEach((pose, i) => {
    if (!pose.visible) return;
    const target = show.flights[i].target, width = target.w * show.width;
    // Muestreo de la curvatura cilíndrica, incluyendo los bordes de la malla.
    for (let k = 0; k <= 24; k++) for (const y of [-1, 1]) {
      const x = width * (k / 24 - 0.5), angle = pose.curl;
      const radius = angle ? width / angle : 0, turn = angle * k / 24;
      points.push(new Vector3(angle ? -width / 2 + radius * Math.sin(turn) : x,
        y * target.h * show.height / 2, 0.002 + (angle ? radius * (1 - Math.cos(turn)) : 0))
        .applyQuaternion(pose.rotation).add(pose.position));
    }
  });
  return points;
}

/** Ajuste en perspectiva: distancia mínima que contiene la envolvente con 2,5% de aire. */
export function figuritasFraming(show: StickerShow, fov: number, aspect: number): CamPose {
  const points: Vector3[] = [];
  for (const x of [-1, 1]) for (const z of [-1, 1]) points.push(new Vector3(x * show.width, 0.1, z * show.height / 2));
  const times = [show.start, show.open, show.opened, show.leave, show.end];
  for (const flight of show.flights) times.push(flight.exit, flight.fly, flight.lower, flight.stick);
  times.sort((a, b) => a - b);
  for (let i = 1; i < times.length; i++) for (let k = 0; k <= 24; k++)
    points.push(...showPoints(show, times[i - 1] + (times[i] - times[i - 1]) * k / 24));
  const tanV = Math.tan(fov * Math.PI / 360) * 0.95, tanH = tanV * aspect;
  let best: CamPose | undefined, bestWidth = 0;
  const desired = aspect < 0.7 ? 0.82 : aspect > 1.3 ? 0.57 : 0.72;
  let bestElevation = 0;
  for (const azimuth of aspect > 1.3 ? [-40, -20, 0, 20, 40] : [0]) for (let elevation = 18; elevation <= 80; elevation += 2) {
    const el = elevation * Math.PI / 180, az = azimuth * Math.PI / 180;
    const rightAxis = new Vector3(Math.cos(az), 0, -Math.sin(az));
    const up = new Vector3(-Math.sin(az) * Math.sin(el), Math.cos(el), -Math.cos(az) * Math.sin(el));
    const forward = new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    const projected = points.map((p) => [p.dot(rightAxis), p.dot(up), p.dot(forward)]);
    let left = -Infinity, right = Infinity, bottom = -Infinity, top = Infinity, near = -Infinity;
    for (const [x, y, z] of projected) {
      left = Math.max(left, x + z * tanH); right = Math.min(right, x - z * tanH);
      bottom = Math.max(bottom, y + z * tanV); top = Math.min(top, y - z * tanV);
      near = Math.max(near, z);
    }
    const hi = Math.max(near + 0.01, (left - right) / (2 * tanH), (bottom - top) / (2 * tanV));
    const cx = (left + right) / 2;
    const target = up.clone().multiplyScalar((bottom + top) / 2).addScaledVector(rightAxis, cx);
    // CameraPath exige un objetivo sobre la mesa: desplazarlo sobre el mismo rayo.
    const shift = target.y < 0 ? -target.y / Math.sin(el) : 0;
    target.addScaledVector(forward, shift);
    const xs = [-1, 1].flatMap((x) => [-1, 1].map((z) => {
      const p = new Vector3(x * show.width, 0.1, z * show.height / 2);
      return (p.dot(rightAxis) - cx) / ((hi - p.dot(forward)) * tanH / 0.95);
    }));
    const width = (Math.max(...xs) - Math.min(...xs)) / 2;
    if ((width >= desired && elevation > bestElevation) || (bestWidth < desired && width > bestWidth)) {
      bestWidth = width; bestElevation = elevation;
      best = { azimuth, elevation, distance: hi - shift, target: [target.x, target.y, target.z] };
    }
  }
  return best!;
}



