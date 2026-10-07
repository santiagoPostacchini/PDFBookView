import { CameraPath, type PathKey } from '../studio/cameraPath';
import { fitDistance, type CamPose, type Region } from '../studio/framing';
import { FORMATS, type BookShape, type PromoProject, type SceneKind, type SceneLength, type TypographyId } from './model';
import { SCENES, templateById, type Template, type Transition } from './templates';

/**
 * Compilador del guion: proyecto (escenas, textos, formato) + medidas del libro
 * → línea de tiempo con la cámara, los giros de hojas y los textos en pantalla.
 * Lógica pura y determinista (se prueba sin navegador).
 *
 * Criterios tomados de videos de producto profesionales:
 * - una sola idea de cámara por escena, lenta y a velocidad pareja;
 * - la cámara nunca se detiene: o fluye de una escena a la otra (toma continua)
 *   o se corta en pleno movimiento;
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
  path: CameraPath;
}

export interface CompiledScene {
  kind: SceneKind;
  label: string;
  start: number;
  end: number;
  /** Doble página a la vista durante la escena. */
  spread: number;
}

export interface Timeline {
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
  look: { vignette: number; grain: number };
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

export function compileProject(project: PromoProject, book: BookShape): Timeline {
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
  const specs = project.scenes.filter((s) => canOpen || s.kind === 'portada' || s.kind === 'cierre');
  const weights = specs.map((s) => SCENES[s.kind].base * LENGTH[s.length ?? 'normal'] * template.pace);
  const durations = sceneDurations(
    weights,
    project.duration,
    specs.map((s) => MIN_SCENE[s.kind] ?? MIN_DEFAULT),
  );
  const D = durations.reduce((a, b) => a + b, 0);

  const framing = makeFraming(W, H, fov, aspect);
  const plan = spreadPlan(L, specs.filter((s) => SCENES[s.kind].usesSpread).length);
  let planIndex = 0;

  const scenes: CompiledScene[] = [];
  const shots: Shot[] = [];
  const actions: BookAction[] = [];
  const cues: OverlayCue[] = [];
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
    // La doble página "a la vista" es la que queda al final de la escena.
    scenes.push({ kind: spec.kind, label: SCENES[spec.kind].label, start, end, spread: current });
    shots.push({ ...shot, aperture: shot.aperture * template.aperture });

    if (spec.kind === 'portada' && (project.texts.title || project.texts.subtitle)) {
      cues.push({ kind: 'titulo', start: start + 0.2, end: end + (template.transition === 'continua' ? 0.25 : 0), lines: [project.texts.subtitle, project.texts.title] });
    } else if (spec.kind === 'cierre' && (project.texts.cta || project.texts.handle)) {
      cues.push({ kind: 'cierre', start: start + Math.min(0.7, durations[i] * 0.25), end: D, lines: [project.texts.cta, project.texts.handle] });
    }
    if (spec.caption && spec.kind !== 'portada' && spec.kind !== 'cierre') {
      cues.push({ kind: 'frase', start: start + 0.3, end: end - 0.1, lines: [spec.caption] });
    }
  });

  const segments = template.transition === 'continua' ? continuousSegments(scenes, shots, D) : cutSegments(scenes, shots);

  return {
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
    look: { vignette: template.vignette, grain: template.grain },
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
    portada: (): Shot => ({
      from: hero(-36, 18, 1.32),
      to: hero(-22, 27, 1.14),
      aperture: 1,
    }),
    apertura: (): Shot => ({
      from: hero(-14, 34, 1.16, room * 0.6),
      to: pose(spread, -4, 54, [0, 0.02, 0], 1.1),
      aperture: 0.8,
    }),
    // En vertical la doble página es más ancha que el cuadro: se recorre de un
    // borde al otro (un paneo con los bordes apenas recortados llena el cuadro).
    // En cuadrado y apaisado queda margen abajo para la frase de la escena.
    doblePagina: (side: number): Shot => ({
      from: pose(spread, -16 * side, 58, [-0.12 * W * side, 0.02, (portrait ? 0.08 : 0.02) * H], portrait ? 0.94 : landscape ? 1.3 : 1.14),
      to: pose(spread, 12 * side, 63, [0.12 * W * side, 0.02, (portrait ? 0.06 : 0) * H], portrait ? 0.88 : landscape ? 1.22 : 1.06),
      aperture: 0.7,
    }),
    hojeo: (): Shot => ({
      from: pose(spread, 44, 24, [0.3 * W, 0.25, 0.02 * H], portrait ? 0.98 : 1.1),
      to: pose(spread, 30, 30, [0.16 * W, 0.2, 0], portrait ? 0.9 : 1.0),
      aperture: 1.1,
    }),
    detalle: (): Shot => ({
      from: pose(page, 26, 44, [0.6 * W, 0.02, -0.12 * H], 0.7),
      to: pose(page, 10, 38, [0.44 * W, 0.02, -0.04 * H], 0.6),
      aperture: 2,
    }),
    cenital: (): Shot => ({
      // Objetivo corrido hacia el pie de las páginas: el libro sube y deja lugar a la frase.
      from: pose(spread, -10, 82, [0, 0, portrait ? 0 : 0.07 * H], portrait ? 1.12 : landscape ? 1.42 : 1.26),
      to: pose(spread, 7, 84, [0, 0, portrait ? 0 : 0.07 * H], portrait ? 1.0 : landscape ? 1.3 : 1.14),
      aperture: 0.4,
    }),
    cierre: (): Shot => ({
      from: pose(spread, 10, 50, [0, 0.02, 0], 1.1),
      to: hero(-26, 25, 1.12),
      aperture: 0.9,
    }),
  };
}

/** Toma continua: la cámara recorre todos los planos en una sola curva sin frenar. */
function continuousSegments(scenes: CompiledScene[], shots: Shot[], D: number): CameraSegment[] {
  const keys: PathKey[] = [];
  scenes.forEach((scene, i) => {
    const length = scene.end - scene.start;
    const bridge = Math.min(0.9, length * 0.3);
    keys.push({ t: i === 0 ? 0 : scene.start + bridge, pose: shots[i].from, aperture: shots[i].aperture });
    keys.push({ t: i === scenes.length - 1 ? D : scene.end - bridge, pose: shots[i].to, aperture: shots[i].aperture });
  });
  return [{ start: 0, end: D, path: new CameraPath(keys, D, 0.7) }];
}

/** Cortes: cada plano es un movimiento a velocidad constante, cortado en pleno movimiento. */
function cutSegments(scenes: CompiledScene[], shots: Shot[]): CameraSegment[] {
  return scenes.map((scene, i) => {
    const length = scene.end - scene.start;
    const keys: PathKey[] = [
      { t: 0, pose: shots[i].from, aperture: shots[i].aperture },
      { t: length, pose: shots[i].to, aperture: shots[i].aperture },
    ];
    return { start: scene.start, end: scene.end, path: new CameraPath(keys, length, 1) };
  });
}

/** Estado de cámara en el instante t. */
export function sampleCamera(timeline: Timeline, t: number): { pose: CamPose; aperture: number } {
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
