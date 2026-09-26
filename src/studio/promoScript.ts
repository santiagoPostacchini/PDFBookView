import { CameraPath, type PathKey } from './cameraPath';
import { fitDistance, type CamPose, type Region } from './framing';

/**
 * Guion de un video promocional: planos de cámara, acciones sobre el libro
 * (pasar a una doble página) y efectos, generados a partir del álbum. Lógica
 * pura y determinista: el mismo álbum + opciones da siempre el mismo video.
 */

export type PromoStyle = 'elegante' | 'dinamico' | 'minimal';

export interface PromoSpec {
  style: PromoStyle;
  /** Segundos. */
  duration: number;
  /** Ancho / alto del cuadro (9:16 = 0.5625). */
  aspect: number;
  leafCount: number;
  pageWidth: number;
  pageHeight: number;
}

export interface Shot {
  name: string;
  start: number;
  end: number;
  from: CamPose;
  to: CamPose;
  /** Profundidad de campo del plano (0..1). */
  aperture: number;
}

/** Punto de paso de la cámara: el recorrido es una curva continua que pasa por todos. */
export type Waypoint = PathKey;

export interface BookAction {
  at: number;
  spread: number;
  /** Multiplicador de velocidad de giro. */
  speed: number;
}

export interface Pulse {
  at: number;
  duration: number;
  strength: number;
}

export interface PromoScript {
  spec: PromoSpec;
  duration: number;
  /** Campo vertical de la cámara (grados). */
  fov: number;
  shots: Shot[];
  /** Recorrido continuo de la cámara (sin cortes ni frenadas). */
  camera: CameraPath;
  actions: BookAction[];
  fadeIn: number;
  fadeOut: number;
  sweeps: Pulse[];
  flashes: Pulse[];
  vignette: number;
  grain: number;
  /** Dobles páginas que aparecen quietas en cámara (para precargar en alta). */
  featuredSpreads: number[];
}

export interface ScriptSample {
  pose: CamPose;
  aperture: number;
  fade: number;
  flash: number;
  sweep: number;
  sweepStrength: number;
}

interface StyleSpec {
  intro: number;
  open: number;
  outro: number;
  /** Duración mínima de cada plano del cuerpo (s). */
  minSegment: number;
  maxFeatured: number;
  flipSpeed: number;
  aperture: number;
  vignette: number;
  grain: number;
  sweeps: boolean;
  flashes: boolean;
  body: ShotKind[];
}

type ShotKind = 'pan' | 'sideFlip' | 'detail' | 'lowAngle' | 'topDown' | 'orbit';

const STYLES: Record<PromoStyle, StyleSpec> = {
  elegante: {
    intro: 0.2, open: 0.11, outro: 0.16, minSegment: 2.6, maxFeatured: 4, flipSpeed: 0.85,
    aperture: 0.55, vignette: 0.45, grain: 0.12, sweeps: true, flashes: false,
    body: ['pan', 'sideFlip', 'detail', 'lowAngle', 'topDown'],
  },
  dinamico: {
    intro: 0.14, open: 0.09, outro: 0.14, minSegment: 1.8, maxFeatured: 6, flipSpeed: 1.45,
    aperture: 0.45, vignette: 0.35, grain: 0.18, sweeps: true, flashes: true,
    body: ['orbit', 'lowAngle', 'sideFlip', 'detail', 'pan'],
  },
  minimal: {
    intro: 0.2, open: 0.12, outro: 0.15, minSegment: 3.2, maxFeatured: 3, flipSpeed: 0.9,
    aperture: 0.2, vignette: 0.2, grain: 0, sweeps: false, flashes: false,
    body: ['topDown', 'pan'],
  },
};

export const PROMO_STYLES: { id: PromoStyle; label: string; description: string }[] = [
  { id: 'elegante', label: 'Elegante', description: 'Movimientos lentos, desenfoque suave y barridos de luz.' },
  { id: 'dinamico', label: 'Dinámico', description: 'Más cortes, órbitas y giros rápidos con destellos.' },
  { id: 'minimal', label: 'Minimal', description: 'Pocos planos, cenitales y paneos limpios.' },
];

/** Elige `count` dobles páginas interiores repartidas a lo largo del libro. */
export function pickFeaturedSpreads(leafCount: number, count: number): number[] {
  const first = 1;
  const last = leafCount - 1; // la última doble página interior (antes de la contratapa)
  if (last < first || count < 1) return [];
  if (count === 1) return [first];
  const picks = new Set<number>();
  for (let i = 0; i < count; i++) picks.add(Math.round(first + (i * (last - first)) / (count - 1)));
  return [...picks];
}

export function buildPromoScript(spec: PromoSpec): PromoScript {
  const style = STYLES[spec.style];
  const { duration: D, aspect, pageWidth: W, pageHeight: H, leafCount } = spec;
  const portrait = aspect < 0.8;
  const fov = portrait ? 40 : 32;

  const closed: Region = { width: W, depth: H };
  const spread: Region = { width: 2 * W, depth: H };
  const page: Region = { width: W, depth: H };
  const fit = (region: Region, azimuth: number, elevation: number, margin = 1.12) =>
    fitDistance(region, { azimuth, elevation }, fov, aspect, margin);
  const pose = (region: Region, azimuth: number, elevation: number, target: [number, number, number], margin?: number): CamPose => ({
    azimuth,
    elevation,
    distance: fit(region, azimuth, elevation, margin),
    target,
  });
  const center: [number, number, number] = [0, 0.02, 0];
  const leftPage: [number, number, number] = [-W / 2, 0.02, 0];
  const rightPage: [number, number, number] = [W / 2, 0.02, 0];

  const introEnd = D * style.intro;
  const openEnd = introEnd + D * style.open;
  const outroStart = D * (1 - style.outro);
  const bodyLength = outroStart - openEnd;
  const segments = Math.max(1, Math.min(style.maxFeatured, Math.floor(bodyLength / style.minSegment)));
  const featured = pickFeaturedSpreads(leafCount, segments);

  const shots: Shot[] = [];
  const actions: BookAction[] = [];
  const sweeps: Pulse[] = [];
  const flashes: Pulse[] = [];
  const add = (name: string, start: number, end: number, from: CamPose, to: CamPose, aperture = style.aperture) =>
    shots.push({ name, start, end, from, to, aperture });

  // Intro: libro cerrado, leve órbita desde un ángulo bajo.
  // (Con una sola hoja no hay tapa que abrir: la intro ocupa también ese tramo.)
  add('intro', 0, leafCount > 1 ? introEnd : openEnd, pose(closed, -42, 22, center, 1.4), pose(closed, -8, 40, center, 1.05));

  // Se abre la tapa mientras la cámara sube.
  if (leafCount > 1) {
    actions.push({ at: introEnd + 0.15, spread: 1, speed: style.flipSpeed });
    add(
      'apertura',
      introEnd,
      openEnd,
      // Arranca sobre el libro cerrado (centrado) y termina sobre la primera página que aparece.
      pose(portrait ? closed : spread, 0, 50, center, portrait ? 1.12 : 1.25),
      pose(portrait ? page : spread, 0, 64, portrait ? leftPage : center, portrait ? 1.1 : 1.05),
    );
  }

  // Cuerpo: un plano por doble página destacada; el giro ocurre en cámara.
  let current = leafCount > 1 ? 1 : 0;
  const segLength = bodyLength / segments;
  for (let i = 0; i < segments; i++) {
    const start = openEnd + i * segLength;
    const end = start + segLength;
    const target = featured[i];
    if (target !== undefined && target !== current) {
      actions.push({ at: start + segLength * 0.3, spread: target, speed: style.flipSpeed * (Math.abs(target - current) > 2 ? 1.3 : 1) });
      current = target;
    }
    const kind = style.body[i % style.body.length];
    const side = i % 2 === 0 ? 1 : -1;
    switch (kind) {
      case 'pan':
        if (portrait) add('paneo', start, end, pose(page, -16, 58, leftPage, 1.12), pose(page, 16, 64, rightPage, 1.04));
        else add('paneo', start, end, pose(spread, -24 * side, 54, center, 1.1), pose(spread, 24 * side, 64, center, 1.0));
        break;
      case 'sideFlip':
        add('giro lateral', start, end, pose(spread, 68, 26, [W * 0.25, 0.3, 0], 1.0), pose(spread, 38, 42, [W * 0.15, 0.2, 0], 0.9));
        break;
      case 'detail':
        add('detalle', start, end, pose(page, 34, 56, [W * 0.6, 0.02, -H * 0.22], 0.66), pose(page, 2, 42, [W * 0.3, 0.02, -H * 0.05], 0.52), style.aperture + 0.3);
        break;
      case 'lowAngle':
        add('contrapicado', start, end, pose(page, -44, 10, [W * 0.35, 0.2, 0.3], 1.2), pose(page, -12, 22, [W * 0.15, 0.15, 0.15], 1.0), style.aperture + 0.25);
        break;
      case 'topDown':
        add('cenital', start, end, pose(portrait ? page : spread, -20, 78, portrait ? rightPage : center, 1.28), pose(portrait ? page : spread, 20, 84, portrait ? rightPage : center, 1.0), style.aperture * 0.5);
        break;
      case 'orbit':
        add('órbita', start, end, pose(spread, -48 * side, 40, center, 1.1), pose(spread, 44 * side, 50, center, 1.0), style.aperture);
        break;
    }
    if (i > 0 && style.flashes) flashes.push({ at: start, duration: 0.18, strength: 0.55 });
    if (style.sweeps && (i % 2 === 0 || style.flashes)) sweeps.push({ at: start + 0.15, duration: Math.min(1.3, segLength * 0.7), strength: 0.45 });
  }

  // Cierre: el libro se cierra en cascada y la cámara se aleja.
  if (leafCount > 1) actions.push({ at: outroStart + 0.1, spread: 0, speed: style.flipSpeed * 1.6 });
  add('cierre', outroStart, D, pose(spread, 14, 62, center, 1.0), pose(closed, -26, 32, center, 1.5), style.aperture * 0.6);

  // La cámara recorre todos los ángulos en un único movimiento continuo. Los
  // tiempos se reparten según la distancia recorrida, y los giros de hojas y
  // efectos se corren con ellos para seguir ocurriendo en el ángulo que les toca.
  const keys = buildPath(shots);
  const camera = new CameraPath(keys, D);
  const warp = (t: number) => camera.warp(keys, t);
  for (const a of actions) a.at = warp(a.at);
  for (const p of [...sweeps, ...flashes]) p.at = warp(p.at);
  for (const shot of shots) {
    shot.start = warp(shot.start);
    shot.end = warp(shot.end);
  }

  return {
    spec,
    duration: D,
    fov,
    shots,
    camera,
    actions,
    fadeIn: style.flashes ? 0.3 : 0.55,
    fadeOut: 0.6,
    sweeps,
    flashes,
    vignette: style.vignette,
    grain: style.grain,
    featuredSpreads: [...new Set([leafCount > 1 ? 1 : 0, ...featured])],
  };
}

const pulse = (pulses: Pulse[], t: number) =>
  pulses.reduce((max, p) => {
    if (t < p.at || t > p.at + p.duration) return max;
    const u = (t - p.at) / p.duration;
    return Math.max(max, p.strength * Math.sin(Math.PI * u));
  }, 0);

/**
 * Puntos de paso a partir de los planos: cada ángulo se recorre despacio y el
 * cambio al siguiente es un barrido de cámara (no un corte), así el movimiento
 * nunca se detiene.
 */
function buildPath(shots: Shot[]): Waypoint[] {
  const path: Waypoint[] = [];
  shots.forEach((shot, i) => {
    // Tramo de transición entre ángulos: largo, para que el barrido no sea un latigazo.
    const bridge = Math.min(1.1, (shot.end - shot.start) * 0.32);
    path.push({ t: i === 0 ? shot.start : shot.start + bridge, pose: shot.from, aperture: shot.aperture });
    path.push({ t: i === shots.length - 1 ? shot.end : shot.end - bridge, pose: shot.to, aperture: shot.aperture });
  });
  return path;
}

/** Estado del video en el instante t (segundos). */
export function sampleScript(script: PromoScript, t: number): ScriptSample {
  const time = Math.max(0, Math.min(script.duration, t));
  const { pose, aperture } = script.camera.sample(time);
  const sweep = script.sweeps.find((p) => time >= p.at && time <= p.at + p.duration);
  return {
    pose,
    aperture,
    fade: Math.max(0, 1 - time / script.fadeIn, 1 - (script.duration - time) / script.fadeOut),
    flash: pulse(script.flashes, time),
    sweep: sweep ? (time - sweep.at) / sweep.duration : 0,
    sweepStrength: sweep ? sweep.strength : 0,
  };
}

/** Páginas (0-based) que conviene tener en alta antes de grabar. */
export function pagesToPreload(script: PromoScript, pageCount: number): number[] {
  const pages = new Set<number>();
  for (const s of script.featuredSpreads) {
    // La doble página y las caras de las hojas que giran hacia ella y desde ella.
    for (const p of [2 * s - 3, 2 * s - 2, 2 * s - 1, 2 * s, 2 * s + 1, 2 * s + 2]) if (p >= 0 && p < pageCount) pages.add(p);
  }
  pages.add(0);
  return [...pages].sort((a, b) => a - b);
}
