import { Quaternion, Vector3 } from 'three';
import type { BookShape } from '../model';
import type { FiguritasKit } from './assets';
import type { StickerTarget } from './targets';

export interface Flight { target: StickerTarget; exit: number; fly: number; lower: number; stick: number }
export interface StickerShow {
  start: number; end: number; open: number; opened: number; leave: number;
  width: number; height: number; packWidth: number; packHeight: number;
  packPosition: Vector3; packRotation: Quaternion;
  flights: Flight[]; turns: { at: number; spread: number }[];
}
export interface Pose { position: Vector3; rotation: Quaternion; visible: boolean }
export interface ShowPose { pack: Pose; companions: Pose[]; flap: number; stickers: (Pose & { pasted: boolean; curl: number })[] }
const ease = (t: number) => t * t * (3 - 2 * t);
const progress = (t: number, a: number, b: number) => Math.max(0, Math.min(1, (t - a) / (b - a)));
const rx = (angle: number) => new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), angle);

/** Tres sobres boca arriba, separados en abanico a la derecha del álbum. */
export function restingPacks(show: StickerShow): Pose[] {
  const halfWidth = show.packWidth / 2 * Math.cos(14 * Math.PI / 180) + show.packHeight / 2 * Math.sin(14 * Math.PI / 180);
  const depth = show.packWidth * 0.08;
  return [0, 1, 2].map((i) => ({
    position: new Vector3(show.width + 0.2 + halfWidth + i * show.packWidth * 0.16,
      depth / 2 + 0.008 + i * (depth + 0.008), (i - 1) * show.packHeight * 0.18),
    rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), (i - 1) * 14 * Math.PI / 180).multiply(rx(-Math.PI / 2)),
    visible: true,
  }));
}

/** Huella que debe entrar en la toma final y en la mesa. */
export function packTableBounds(show: StickerShow) {
  let minX = -show.width, maxX = show.width, minZ = -show.height / 2, maxZ = show.height / 2;
  for (const pack of restingPacks(show)) for (const x of [-1, 1]) for (const y of [-1, 1]) {
    const corner = new Vector3(x * show.packWidth / 2, y * show.packHeight / 2, 0).applyQuaternion(pack.rotation).add(pack.position);
    minX = Math.min(minX, corner.x); maxX = Math.max(maxX, corner.x);
    minZ = Math.min(minZ, corner.z); maxZ = Math.max(maxZ, corner.z);
  }
  return { minX, maxX, minZ, maxZ };
}

export function showDuration(targets: readonly StickerTarget[]): number {
  let spread = targets[0]?.spread;
  return 0.9 + 0.45 + targets.reduce((total, target) => {
    const turn = target.spread !== spread ? 1.3 : 0;
    spread = target.spread;
    return total + turn + 0.42 + 0.6 + 0.45 + 0.65;
  }, 0) + 1.1;
}

export function createShow(targets: StickerTarget[], book: BookShape, kit: FiguritasKit, aspect: number, start = 0, duration = showDuration(targets)): StickerShow {
  const f = Math.max(0.75, Math.min(1.5, duration / showDuration(targets)));
  const packWidth = book.pageWidth * kit.pack.widthPt / book.pagePt!.width;
  const packHeight = book.pageHeight * kit.pack.heightPt / book.pagePt!.height;
  const yaw = (aspect > 1.3 ? 38 : -8) * Math.PI / 180;
  const packRotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw).multiply(rx(-28 * Math.PI / 180));
  const footprint = packHeight * Math.sin(28 * Math.PI / 180) / 2;
  const packPosition = new Vector3(aspect > 1.3 ? book.pageWidth + 0.3 + packWidth / 2 : 0,
    packHeight * Math.cos(28 * Math.PI / 180) / 2 + 0.02,
    aspect > 1.3 ? 0 : book.pageHeight / 2 + 0.25 + footprint);
  const open = start + 0.9 * f, opened = open + 0.45 * f;
  let t = opened, spread = targets[0]?.spread;
  const turns: StickerShow['turns'] = [], flights: Flight[] = [];
  for (const target of targets) {
    if (target.spread !== spread) { turns.push({ at: t, spread: target.spread }); t += 1.3 * f; spread = target.spread; }
    const exit = t, fly = exit + 0.42 * f, lower = fly + 0.6 * f, stick = lower + 0.45 * f;
    flights.push({ target, exit, fly, lower, stick });
    // Dar tiempo a ver la figurita apoyada antes del próximo vuelo o giro.
    t = stick + 0.65 * f;
  }
  return { start, end: start + duration, open, opened, leave: t, width: book.pageWidth, height: book.pageHeight,
    packWidth, packHeight, packPosition, packRotation, flights, turns };
}

/** Poses sin estado: el aterrizaje se mide en vivo sobre la pila de la página. */
export function evaluateShow(show: StickerShow, t: number, landing: (page: number) => Vector3): ShowPose {
  const enter = 1 - ease(progress(t, show.start, show.open));
  const settle = ease(progress(t, show.leave, show.end));
  const resting = restingPacks(show);
  // Después del último pegado se desplaza al mazo y se acuesta, con un arco leve.
  const pack = { position: show.packPosition.clone().add(new Vector3(0, 0, enter * show.height * 2)),
    rotation: show.packRotation.clone(), visible: t >= show.start };
  if (t >= show.leave) {
    pack.position.lerp(resting[2].position, settle);
    pack.position.y += Math.sin(Math.PI * settle) * show.packHeight * 0.12;
    pack.rotation.slerp(resting[2].rotation, settle);
  }
  const mouth = new Vector3(0, show.packHeight / 2, 0).applyQuaternion(show.packRotation).add(show.packPosition);
  const stickers = show.flights.map(({ target, exit, fly, lower, stick }) => {
    const rotation = show.packRotation.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), target.sticker.widthPt > target.sticker.heightPt ? Math.PI / 2 : 0));
    const insideHeight = target.sticker.widthPt > target.sticker.heightPt ? target.w * show.width : target.h * show.height;
    const from = mouth.clone().add(new Vector3(0, -insideHeight / 2, 0).applyQuaternion(show.packRotation));
    const free = mouth.clone().add(new Vector3(0, insideHeight / 2 + 0.12, 0).applyQuaternion(show.packRotation));
    const end = landing(target.page).clone().add(new Vector3((target.u - 0.5) * show.width, 0.002, (target.v - 0.5) * show.height));
    const above = end.clone().add(new Vector3(0, 0.06, 0));
    const finalRotation = rx(-Math.PI / 2);
    let position: Vector3;
    if (t < fly) position = from.lerp(free, ease(progress(t, exit, fly)));
    else if (t < lower) {
      const u = progress(t, fly, lower), e = ease(u);
      position = free.clone().lerp(above, e); position.y += Math.sin(Math.PI * u) * show.height * 0.35;
      rotation.slerp(finalRotation, e);
    } else { position = above.lerp(end, ease(progress(t, lower, stick))); rotation.copy(finalRotation); }
    const curl = 0.65 * ease(progress(t, fly, lower)) * (1 - ease(progress(t, lower, stick)));
    return { position, rotation, curl, visible: t >= exit && t < stick, pasted: t >= stick };
  });
  return { pack, companions: resting.slice(0, 2).map((pose) => ({ ...pose, visible: t >= show.start })),
    flap: (-150 * ease(progress(t, show.open, show.opened)) - 30 * settle) * Math.PI / 180, stickers };
}
