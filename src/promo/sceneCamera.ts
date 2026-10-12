import { posePosition, type CamPose } from '../studio/framing';
import type { SceneCamera } from './model';

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const limited = (value: unknown, max: number, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : fallback;

/** Los proyectos viejos quedan fijos; valores rotos no pueden disparar la cámara. */
export function sanitizeSceneCamera(value: unknown): SceneCamera | undefined {
  if (!object(value)) return undefined;
  const result: SceneCamera = {};
  if (typeof value.framingZoom === 'number' && Number.isFinite(value.framingZoom)) result.framingZoom = limited(value.framingZoom, 1, 0);
  if (object(value.zoom)) result.zoom = { enabled: value.zoom.enabled === true, from: limited(value.zoom.from, 0.1, 0), to: limited(value.zoom.to, 0.1, 0.06) };
  if (object(value.lateral)) result.lateral = { enabled: value.lateral.enabled === true, amount: limited(value.lateral.amount, 0.15, 0.08), direction: value.lateral.direction === 'izquierda' ? 'izquierda' : 'derecha' };
  if (object(value.lateral) && value.lateral.orbit === true) result.lateral!.orbit = true;
  return result.zoom || result.lateral || result.framingZoom !== undefined ? result : undefined;
}

/** Dos puntos por toma; el lateral traslada cámara y objetivo en el eje del cuadro. */
export function sceneCameraPoints(base: CamPose, camera: SceneCamera | undefined, pageWidth: number): [CamPose, CamPose] {
  const settings = sanitizeSceneCamera(camera);
  base = { ...base, distance: base.distance / (1 + (settings?.framingZoom ?? 0)) };
  const zoom = settings?.zoom;
  const lateral = settings?.lateral;
  if (lateral?.enabled && lateral.orbit) {
    // Centro del álbum, conservando la altura de enfoque y la posición central de cámara.
    const position = posePosition(base);
    const target: CamPose['target'] = [0, base.target[1], 0];
    const dx = position[0], dy = position[1] - target[1], dz = position[2];
    const distance = Math.hypot(dx, dy, dz);
    const azimuth = Math.atan2(dx, dz) * 180 / Math.PI;
    const elevation = Math.atan2(dy, Math.hypot(dx, dz)) * 180 / Math.PI;
    const angle = lateral.amount * 60 * (lateral.direction === 'izquierda' ? -1 : 1);
    return [0, 1].map((end) => ({ azimuth: azimuth + (end - 0.5) * angle, elevation,
      distance: distance / (1 + (zoom?.enabled ? (end ? zoom.to : zoom.from) : 0)), target })) as [CamPose, CamPose];
  }
  const travel = lateral?.enabled ? pageWidth * lateral.amount * (lateral.direction === 'izquierda' ? -1 : 1) : 0;
  const az = base.azimuth * Math.PI / 180;
  return [0, 1].map((end) => {
    const offset = (end - 0.5) * travel;
    const amount = zoom?.enabled ? (end ? zoom.to : zoom.from) : 0;
    return { ...base, distance: base.distance / (1 + amount), target: [base.target[0] + Math.cos(az) * offset, base.target[1], base.target[2] - Math.sin(az) * offset] } as CamPose;
  }) as [CamPose, CamPose];
}
