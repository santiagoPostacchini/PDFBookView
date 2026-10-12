import { figuritasFraming } from './figuritas/framing';
import { CameraPath, type PathKey } from '../studio/cameraPath';
import { fitDistance, lerpPose, type CamPose, type Region } from '../studio/framing';
import { FORMATS, type BookShape, type PromoProject, type SceneKind, type SceneLength, type SceneSpec, type TypographyId } from './model';
import { sceneCameraPoints } from './sceneCamera';
import { SCENES, templateById, type Template, type Transition } from './templates';
import type { FiguritasKit } from './figuritas/assets';
import { resolveTargets } from './figuritas/targets';
import { createShow, packTableBounds, showDuration, type StickerShow } from './figuritas/choreography';

/**
 * Compilador del guion: proyecto (escenas, textos, formato) + medidas del libro
 * → línea de tiempo con la cámara, los giros de hojas y los textos en pantalla.
 * Lógica pura y determinista (se prueba sin navegador).
 *
 * Criterios tomados de videos de producto profesionales:
 * - un encuadre fijo por escena, con ángulos y acercamientos distintos;
 * - cortes directos entre planos; sólo se mueven el álbum y las figuritas;
 * - el giro de hoja que lleva a la escena siguiente arranca un poco antes del
 *   cambio, así la acción "cruza" el corte;
 * - el producto se ve desde el primer cuadro (sin fundido desde negro) y los
 *   textos quedan dentro de las zonas seguras de Reels/TikTok.
 */

export interface BookAction {
  at: number;
  spread: number;
  speed: number;
}

export type CueKind = 'titulo' | 'frase' | 'cierre';

export interface OverlayCue {
  kind: CueKind;
  start: number;
  end: number;
  /** titulo: [subtítulo, título]; cierre: [llamado a la acción, usuario]; frase: [texto]. */
  lines: string[];
}

export interface CameraSegment {
  start: number;
  end: number;
  path: Pick<CameraPath, 'sample'>;
}

export interface CompiledScene {
  /** Posición de la escena en `project.scenes` (algunas se omiten si el libro no se puede abrir). */
  index: number;
  kind: SceneKind;
  label: string;
  start: number;
  end: number;
  /** Doble página a la vista durante la escena. */
  spread: number;
}

export interface Timeline {
  windowShadow?: number;
  table?: boolean;
  coverColor?: string;
  shows?: StickerShow[];
  duration: number;
  width: number;
  height: number;
  aspect: number;
  /** Campo vertical de la cámara (grados). */
  fov: number;
  transition: Transition;
  segments: CameraSegment[];
  actions: BookAction[];
  cues: OverlayCue[];
  scenes: CompiledScene[];
  look: { vignette: number; grain: number; ambientOcclusion?: number };
  set: string;
  lighting: string;
  typography: TypographyId;
  /** Dobles páginas que aparecen en cámara (para precargar en alta). */
  spreads: number[];
  /** Doble página en el primer cuadro (0 = cerrado, mostrando la tapa). */
  startSpread: number;
}

const LENGTH: Record<SceneLength, number> = { corta: 0.75, normal: 1, larga: 1.35 };
/** Mínimos por escena (s): el título y el llamado a la acción tienen que llegar a leerse. */
const MIN_SCENE: Partial<Record<SceneKind, number>> = { portada: 2, cierre: 2.6 };
const MIN_DEFAULT = 1.3;

/** Reparte la duración total entre escenas según su peso, con un mínimo por escena. */
export function sceneDurations(weights: number[], total: number, mins: number[] = weights.map(() => MIN_DEFAULT)): number[] {
  if (weights.length === 0) return [];
  // Si no entran todos los mínimos (muchas escenas en poco tiempo), se achican parejo.
  const minSum = mins.reduce((a, b) => a + b, 0);
  if (minSum > total) mins = mins.map((m) => (m * total) / minSum);
  let fixed = new Array(weights.length).fill(false);
  let out = weights.slice();
  for (let pass = 0; pass < weights.length; pass++) {
    const freeWeight = weights.reduce((s, w, i) => (fixed[i] ? s : s + w), 0);
    const freeTime = total - fixed.reduce((s, f, i) => (f ? s + mins[i] : s), 0);
    out = weights.map((w, i) => (fixed[i] ? mins[i] : freeWeight > 0 ? (w / freeWeight) * freeTime : 0));
    const next = out.map((d, i) => fixed[i] || d < mins[i]);
    if (next.every((f, i) => f === fixed[i])) break;
    fixed = next;
  }
  return out;
}

/** `count` dobles páginas interiores repartidas en orden a lo largo del libro. */
export function spreadPlan(leafCount: number, count: number): number[] {
  const last = Math.max(1, leafCount - 1);
  if (count <= 0) return [];
  if (count === 1) return [Math.min(last, 2)];
  return Array.from({ length: count }, (_, i) => Math.round(1 + (i * (last - 1)) / (count - 1)));
}

const FOV: Record<string, number> = { '9:16': 36, '4:5': 32, '1:1': 30, '16:9': 24 };

export function compileProject(project: PromoProject, book: BookShape, kit?: FiguritasKit): Timeline {
  const template = templateById(project.template);
  const format = FORMATS[project.format];
  const aspect = format.width / format.height;
  const fov = FOV[project.format] ?? 32;
  const W = book.pageWidth;
  const H = book.pageHeight;
  const L = book.leafCount;
  const interior = Math.max(1, L - 1);
  const canOpen = L >= 2;

  // Escenas utilizables según el libro (con una sola hoja no hay nada que abrir).
  const usable = project.scenes.map((s, index) => ({ s, index })).filter(({ s }) =>
    (canOpen || s.kind === 'portada' || s.kind === 'cierre') && (s.kind !== 'figuritas' || resolveTargets(s, book, kit).length > 0));
  const specs = usable.map(({ s }) => s);
  const weights = specs.map((s) => SCENES[s.kind].base * LENGTH[s.length ?? 'normal'] * template.pace);
  const mins = specs.map((s) => s.kind === 'figuritas' ? showDuration(resolveTargets(s, book, kit)) * 0.8 : MIN_SCENE[s.kind] ?? MIN_DEFAULT);
  const durations = sceneDurations(
    weights,
    specs.some((s) => s.kind === 'figuritas') ? Math.max(project.duration, mins.reduce((a, b) => a + b, 0)) : project.duration,
    mins,
  );
  const D = durations.reduce((a, b) => a + b, 0);

  const framing = makeFraming(W, H, fov, aspect);
  const plan = spreadPlan(L, specs.filter((s) => SCENES[s.kind].usesSpread).length);
  let planIndex = 0;

  const scenes: CompiledScene[] = [];
  const shots: Shot[] = [];
  const actions: BookAction[] = [];
  const cues: OverlayCue[] = [];
  const shows: StickerShow[] = [];
  let current = 0;
  let startSpread = 0;
  let t = 0;
  let slide = 1;

  /** Lleva el libro a `target` justo antes de `at` (el giro cruza el cambio de plano). */
  const turnTo = (target: number, at: number, prevStart: number) => {
    if (target === current) return;
    if (scenes.length === 0) {
      // Primera escena: el video arranca directamente en esa doble página.
      startSpread = current = target;
      return;
    }
    const lead = Math.min(0.45, (at - prevStart) * 0.35);
    actions.push({ at: Math.max(0, at - lead), spread: target, speed: template.flipSpeed * (Math.abs(target - current) > 2 ? 1.35 : 1) });
    current = target;
  };

  specs.forEach((spec, i) => {
    const start = t;
    const end = t + durations[i];
    const prevStart = scenes[i - 1]?.start ?? 0;
    t = end;
    let shot: Shot;
    switch (spec.kind) {
      case 'figuritas': {
        const targets = resolveTargets(spec, book, kit);
        turnTo(targets[0].spread, start, prevStart);
        const show = createShow(targets, book, kit!, aspect, start, durations[i]);
        shows.push(show);
        actions.push(...show.turns.map((a) => ({ ...a, speed: 1.5 })));
        current = targets[targets.length - 1].spread;
        shot = framing.figuritas(show);
        break;
      }
      case 'portada':
        turnTo(0, start, prevStart);
        shot = framing.portada();
        break;
      case 'apertura':
        if (current !== 0) turnTo(0, start, prevStart);
        actions.push({ at: start + Math.min(0.3, durations[i] * 0.15), spread: 1, speed: template.flipSpeed });
        current = 1;
        shot = framing.apertura();
        break;
      case 'cierre':
        actions.push({ at: start + Math.min(0.25, durations[i] * 0.1), spread: 0, speed: template.flipSpeed * 1.25 });
        current = 0;
        shot = framing.cierre();
        break;
      case 'hojeo': {
        planIndex++;
        // Sigue desde donde quedó el libro y pasa 1 a 3 hojas, dejando lugar a las
        // dobles páginas que vienen después; al final del libro, hacia atrás.
        const from = clampSpread(spec.spread ?? (current || 1), interior);
        turnTo(from, start, prevStart);
        const later = specs.slice(i + 1).filter((s) => s.kind === 'doblePagina' && s.spread === undefined).length;
        const room = interior - from - later;
        const steps = room >= 1 ? Math.max(1, Math.min(3, Math.floor(room / 1.5))) : -Math.min(2, from - 1);
        const gap = Math.min(0.55, (durations[i] - 0.6) / Math.max(1, Math.abs(steps)));
        for (let k = 1; k <= Math.abs(steps); k++) {
          actions.push({ at: start + 0.2 + (k - 1) * gap, spread: from + Math.sign(steps) * k, speed: template.flipSpeed * 1.1 });
        }
        current = from + steps;
        shot = framing.hojeo();
        break;
      }
      case 'doblePagina': {
        // Una doble página nueva (repartidas a lo largo del libro si es largo).
        const auto = Math.max(plan[planIndex++] ?? 1, current + 1);
        turnTo(clampSpread(spec.spread ?? auto, interior), start, prevStart);
        shot = framing.doblePagina((slide = -slide));
        break;
      }
      default: {
        // Detalle y cenital muestran la doble página a la vista (otro punto de vista).
        const auto = current >= 1 ? current : (plan[planIndex] ?? 1);
        planIndex++;
        turnTo(clampSpread(spec.spread ?? auto, interior), start, prevStart);
        shot = spec.kind === 'detalle' ? framing.detalle() : framing.cenital();
      }
    }
    // Los planos generales posteriores conservan el mazo junto al álbum.
    if (shows.length && ['cierre', 'portada', 'cenital', 'doblePagina'].includes(spec.kind)) {
      const bounds = packTableBounds(shows.at(-1)!);
      const region = { width: bounds.maxX - bounds.minX, depth: bounds.maxZ - bounds.minZ };
      const target: CamPose['target'] = [(bounds.minX + bounds.maxX) / 2, 0.04, (bounds.minZ + bounds.maxZ) / 2];
      const widen = (p: CamPose): CamPose => ({ ...p, target, distance: Math.max(p.distance, fitDistance(region, p, fov, aspect) * 1.2) });
      shot = { ...shot, from: widen(shot.from), to: widen(shot.to) };
    }
    // La doble página "a la vista" es la que queda al final de la escena.
    scenes.push({ index: usable[i].index, kind: spec.kind, label: SCENES[spec.kind].label, start, end, spread: current });
    shots.push({ ...shot, aperture: shot.aperture * template.aperture });

    if (i === 0 && (project.texts.title || project.texts.subtitle)) {
      cues.push({ kind: 'titulo', start, end, lines: [project.texts.subtitle, project.texts.title] });
    }
    if (spec.kind === 'cierre' && (project.texts.cta || project.texts.handle)) {
      cues.push({ kind: 'cierre', start: start + Math.min(0.7, durations[i] * 0.25), end: D, lines: [project.texts.cta, project.texts.handle] });
    }
    if (spec.caption && spec.kind !== 'portada' && spec.kind !== 'cierre' && !(i === 0 && (project.texts.title || project.texts.subtitle))) {
      cues.push({ kind: 'frase', start: start + 0.3, end: end - 0.1, lines: [spec.caption] });
    }
  });

  const segments = fixedSegments(scenes, shots, specs, W);

  return {
    windowShadow: project.windowShadow,
    table: project.table,
    shows,
    coverColor: book.coverColor,
    duration: D,
    width: format.width,
    height: format.height,
    aspect,
    fov,
    transition: template.transition,
    segments,
    actions: actions.sort((a, b) => a.at - b.at),
    cues,
    scenes,
    look: { vignette: template.vignette, grain: template.grain, ambientOcclusion: project.ambientOcclusion ?? 0.35 },
    set: project.set,
    lighting: project.lighting,
    typography: project.typography,
    spreads: [...new Set(scenes.map((s) => s.spread).concat(actions.map((a) => a.spread), [startSpread]))].sort((a, b) => a - b),
    startSpread,
  };
}

const clampSpread = (s: number, interior: number) => Math.max(1, Math.min(interior, Math.round(s)));

// ── Cámara ──────────────────────────────────────────────────────────────────

interface Shot {
  from: CamPose;
  to: CamPose;
  aperture: number;
}

/** Recetas de cámara por escena, para un libro y un formato dados. */
function makeFraming(W: number, H: number, fov: number, aspect: number) {
  const closed: Region = { width: W, depth: H };
  const spread: Region = { width: 2 * W, depth: H };
  const page: Region = { width: W, depth: H };
  const pose = (region: Region, azimuth: number, elevation: number, target: [number, number, number], margin: number): CamPose => ({
    azimuth,
    elevation,
    distance: fitDistance(region, { azimuth, elevation }, fov, aspect, margin),
    target,
  });
  // El título y el cierre necesitan aire: en vertical y cuadrado van arriba, así
  // que la cámara apunta un poco más allá del libro (en su dirección de mirada) y
  // el libro baja en el cuadro; en apaisado van a la izquierda y el libro se corre
  // a la derecha.
  const portrait = aspect < 0.8;
  const landscape = aspect > 1.3;
  const room = portrait ? 0.3 : landscape ? 0.42 : 0.36;
  const hero = (azimuth: number, elevation: number, margin: number, amount = room): CamPose => {
    const az = (azimuth * Math.PI) / 180;
    const d = amount * H;
    const target: [number, number, number] = landscape ? [-Math.cos(az) * d, 0.04, Math.sin(az) * d] : [-Math.sin(az) * d, 0.04, -Math.cos(az) * d];
    return pose(closed, azimuth, elevation, target, margin * (1 + amount * (landscape ? 1.2 : 0.9)));
  };

  return {
    figuritas: (show: StickerShow): Shot => {
      const camera = figuritasFraming(show, fov, aspect);
      return { from: camera, to: camera, aperture: 0.15 };
    },
    portada: (): Shot => ({
      from: hero(-28, 32, 1.24),
      to: hero(-28, 32, 1.18),
      aperture: 1,
    }),
    apertura: (): Shot => ({
      from: pose(spread, -14, 50, [0, 0.02, 0], 1.2),
      to: pose(spread, -14, 50, [0, 0.02, 0], 1.14),
      aperture: 0.8,
    }),
    // Doble página completa; en cuadrado y apaisado queda margen para la frase.
    doblePagina: (side: number): Shot => ({
      from: pose(spread, -8 * side, 58, [-0.08 * W * side, 0.02, 0.04 * H], portrait ? 1.08 : landscape ? 1.28 : 1.14),
      to: pose(spread, -8 * side, 58, [0.08 * W * side, 0.02, 0.04 * H], portrait ? 1.08 : landscape ? 1.28 : 1.14),
      aperture: 0.7,
    }),
    hojeo: (): Shot => ({
      from: pose(spread, 22, 40, [0.12 * W, 0.2, 0], 1.14),
      to: pose(spread, 22, 40, [0.12 * W, 0.2, 0], 1.08),
      aperture: 1.1,
    }),
    detalle: (): Shot => ({
      from: pose(page, 20, 52, [0.55 * W, 0.02, -0.06 * H], 0.85),
      to: pose(page, 20, 52, [0.55 * W, 0.02, -0.06 * H], 0.8),
      aperture: 2,
    }),
    cenital: (): Shot => ({
      // Objetivo corrido hacia el pie de las páginas: el libro sube y deja lugar a la frase.
      from: pose(spread, 0, 82, [0, 0, portrait ? 0 : 0.07 * H], portrait ? 1.12 : landscape ? 1.42 : 1.26),
      to: pose(spread, 0, 82, [0, 0, portrait ? 0 : 0.07 * H], portrait ? 1.08 : landscape ? 1.38 : 1.22),
      aperture: 0.4,
    }),
    cierre: (): Shot => ({
      from: hero(-28, 38, 1.55),
      to: hero(-28, 38, 1.55),
      aperture: 0.9,
    }),
  };
}

/** Encuadre fijo por escena, con dos puntos si se activa un movimiento opcional. */
function fixedSegments(scenes: CompiledScene[], shots: Shot[], specs: SceneSpec[], pageWidth: number): CameraSegment[] {
  return scenes.map((scene, i) => {
    const length = scene.end - scene.start;
    const pose = lerpPose(shots[i].from, shots[i].to, 0.5);
    const [from, to] = sceneCameraPoints(pose, specs[i].camera, pageWidth);
    const keys: PathKey[] = [
      { t: 0, pose: from, aperture: shots[i].aperture },
      { t: length, pose: to, aperture: shots[i].aperture },
    ];
    const orbit = specs[i].camera?.lateral;
    const path = orbit?.enabled && orbit.orbit
      ? { sample: (t: number) => ({ pose: lerpPose(from, to, Math.max(0, Math.min(1, t / length))), aperture: shots[i].aperture }) }
      : new CameraPath(keys, length, 1);
    return { start: scene.start, end: scene.end, path };
  });
}

/** Estado de cámara en el instante t. */
export function sampleCamera(timeline: Timeline, t: number): { pose: CamPose; aperture: number } {
  if (!timeline.segments.length) return { pose: { azimuth: 0, elevation: 58, distance: 8, target: [0, 0, 0] }, aperture: 0 };
  const time = Math.max(0, Math.min(timeline.duration, t));
  const segment = timeline.segments.find((s) => time < s.end) ?? timeline.segments[timeline.segments.length - 1];
  return segment.path.sample(time - segment.start);
}

/** Páginas (0-based) que conviene tener en alta antes de grabar. */
export function pagesToPreload(timeline: Timeline, pageCount: number): number[] {
  const pages = new Set<number>([0]);
  for (const s of timeline.spreads) {
    for (const p of [2 * s - 3, 2 * s - 2, 2 * s - 1, 2 * s, 2 * s + 1, 2 * s + 2]) if (p >= 0 && p < pageCount) pages.add(p);
  }
  return [...pages].sort((a, b) => a - b);
}

export type { Template };
