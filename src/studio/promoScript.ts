import { fitDistance, lerpPose, type CamPose, type Region } from './framing';

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

type EaseName = 'linear' | 'inOutSine' | 'inOutCubic' | 'outCubic';

export interface Shot {
  name: string;
  start: number;
  end: number;
  from: CamPose;
  to: CamPose;
  ease: EaseName;
  /** Profundidad de campo del plano (0..1). */
  aperture: number;
}

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
  ease: EaseName;
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
    intro: 0.2, open: 0.11, outro: 0.16, minSegment: 2.6, maxFeatured: 4, flipSpeed: 0.85, ease: 'inOutSine',
    aperture: 0.55, vignette: 0.45, grain: 0.12, sweeps: true, flashes: false,
    body: ['pan', 'sideFlip', 'detail', 'lowAngle', 'topDown'],
  },
  dinamico: {
    intro: 0.14, open: 0.09, outro: 0.14, minSegment: 1.8, maxFeatured: 6, flipSpeed: 1.45, ease: 'inOutCubic',
    aperture: 0.45, vignette: 0.35, grain: 0.18, sweeps: true, flashes: true,
    body: ['orbit', 'lowAngle', 'sideFlip', 'detail', 'pan'],
  },
  minimal: {
    intro: 0.2, open: 0.12, outro: 0.15, minSegment: 3.2, maxFeatured: 3, flipSpeed: 0.9, ease: 'inOutSine',
    aperture: 0.2, vignette: 0.2, grain: 0, sweeps: false, flashes: false,
    body: ['topDown', 'pan'],
  },
};

export const PROMO_STYLES: { id: PromoStyle; label: string; description: string }[] = [
  { id: 'elegante', label: 'Elegante', description: 'Movimientos lentos, desenfoque suave y barridos de luz.' },
  { id: 'dinamico', label: 'Dinámico', description: 'Más cortes, órbitas y giros rápidos con destellos.' },
  { id: 'minimal', label: 'Minimal', description: 'Pocos planos, cenitales y paneos limpios.' },
];

const EASES: Record<EaseName, (t: number) => number> = {
  linear: (t) => t,
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outCubic: (t) => 1 - (1 - t) ** 3,
};

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
  const add = (name: string, start: number, end: number, from: CamPose, to: CamPose, aperture = style.aperture, ease = style.ease) =>
    shots.push({ name, start, end, from, to, ease, aperture });

  // Intro: libro cerrado, leve órbita desde un ángulo bajo.
  // (Con una sola hoja no hay tapa que abrir: la intro ocupa también ese tramo.)
  add('intro', 0, leafCount > 1 ? introEnd : openEnd, pose(closed, -38, 24, center, 1.35), pose(closed, -14, 38, center, 1.08));

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
        if (portrait) add('paneo', start, end, pose(page, -6, 62, leftPage, 1.08), pose(page, 6, 62, rightPage, 1.08));
        else add('paneo', start, end, pose(spread, -12 * side, 58, center, 1.05), pose(spread, 12 * side, 64, center, 1.02));
        break;
      case 'sideFlip':
        add('giro lateral', start, end, pose(spread, 62, 30, [W * 0.25, 0.3, 0], 0.95), pose(spread, 46, 40, [W * 0.2, 0.2, 0], 0.92));
        break;
      case 'detail':
        add('detalle', start, end, pose(page, 22, 52, [W * 0.55, 0.02, -H * 0.2], 0.62), pose(page, 10, 46, [W * 0.35, 0.02, -H * 0.1], 0.55), style.aperture + 0.3);
        break;
      case 'lowAngle':
        add('contrapicado', start, end, pose(page, -30, 12, [W * 0.3, 0.2, 0.3], 1.15), pose(page, -18, 20, [W * 0.2, 0.15, 0.2], 1.05), style.aperture + 0.25);
        break;
      case 'topDown':
        add('cenital', start, end, pose(portrait ? page : spread, 0, 84, portrait ? rightPage : center, 1.18), pose(portrait ? page : spread, 0, 84, portrait ? rightPage : center, 1.0), style.aperture * 0.5, 'inOutSine');
        break;
      case 'orbit':
        add('órbita', start, end, pose(spread, -40 * side, 44, center, 1.08), pose(spread, 35 * side, 48, center, 1.0), style.aperture, 'linear');
        break;
    }
    if (i > 0 && style.flashes) flashes.push({ at: start, duration: 0.18, strength: 0.55 });
    if (style.sweeps && (i % 2 === 0 || style.flashes)) sweeps.push({ at: start + 0.15, duration: Math.min(1.3, segLength * 0.7), strength: 0.45 });
  }

  // Cierre: el libro se cierra en cascada y la cámara se aleja.
  if (leafCount > 1) actions.push({ at: outroStart + 0.1, spread: 0, speed: style.flipSpeed * 1.6 });
  add('cierre', outroStart, D, pose(spread, 0, 60, center, 1.05), pose(closed, -20, 34, center, 1.45), style.aperture * 0.6, 'inOutSine');

  return {
    spec,
    duration: D,
    fov,
    shots,
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

/** Estado del video en el instante t (segundos). */
export function sampleScript(script: PromoScript, t: number): ScriptSample {
  const time = Math.max(0, Math.min(script.duration, t));
  const shot = script.shots.find((s) => time >= s.start && time < s.end) ?? script.shots[script.shots.length - 1];
  const u = shot.end > shot.start ? (time - shot.start) / (shot.end - shot.start) : 1;
  const sweep = script.sweeps.find((p) => time >= p.at && time <= p.at + p.duration);
  return {
    pose: lerpPose(shot.from, shot.to, EASES[shot.ease](Math.max(0, Math.min(1, u)))),
    aperture: shot.aperture,
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
