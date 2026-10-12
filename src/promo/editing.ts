import type { Timeline } from './compile';
import type { PromoProject, SceneKind, SceneSpec } from './model';
import { templateById } from './templates';
import { sanitizeSceneCamera } from './sceneCamera';

/**
 * Ediciones del guion que hace la persona desde el editor. Funciones puras: el
 * proyecto nunca se modifica en el lugar y cada una devuelve también qué escena
 * queda seleccionada.
 */

export interface Edit {
  project: PromoProject;
  /** Escena seleccionada después de la edición. */
  index: number;
}

/** Quita claves sin valor (p. ej. `spread: undefined` = automática) para que el JSON quede limpio. */
function clean(scene: SceneSpec): SceneSpec {
  const out: SceneSpec = { kind: scene.kind };
  const camera = sanitizeSceneCamera(scene.camera);
  if (camera) out.camera = camera;
  if (scene.spread !== undefined) out.spread = scene.spread;
  if (scene.caption) out.caption = scene.caption;
  if (scene.length && scene.length !== 'normal') out.length = scene.length;
  if (scene.stickers !== undefined) out.stickers = scene.stickers.map((s) => ({ ...s }));
  return out;
}

/** Agrega una escena después de `after`; si se agrega al final y el guion termina en el cierre, va antes del cierre. */
export function addScene(project: PromoProject, kind: SceneKind, after: number): Edit {
  const scenes = project.scenes.slice();
  let at = Math.max(0, Math.min(after + 1, scenes.length));
  if (at === scenes.length && scenes.at(-1)?.kind === 'cierre' && kind !== 'cierre') at = scenes.length - 1;
  scenes.splice(at, 0, { kind });
  return { project: { ...project, scenes }, index: at };
}

/** Copia de la escena justo después de ella (misma doble página, frase y duración). */
export function duplicateScene(project: PromoProject, index: number): Edit {
  const scene = project.scenes[index];
  if (!scene) return { project, index };
  const scenes = project.scenes.slice();
  scenes.splice(index + 1, 0, clean({ ...scene }));
  return { project: { ...project, scenes }, index: index + 1 };
}

/** Lleva la escena `from` al lugar `to` (arrastrar y soltar en el guion). */
export function placeScene(project: PromoProject, from: number, to: number): Edit {
  const n = project.scenes.length;
  if (from < 0 || from >= n || to < 0 || to >= n || from === to) return { project, index: from };
  const scenes = project.scenes.slice();
  const [scene] = scenes.splice(from, 1);
  scenes.splice(to, 0, scene);
  return { project: { ...project, scenes }, index: to };
}

export function moveScene(project: PromoProject, index: number, delta: number): Edit {
  const target = index + delta;
  if (target < 0 || target >= project.scenes.length || index < 0 || index >= project.scenes.length) return { project, index };
  const scenes = project.scenes.slice();
  [scenes[index], scenes[target]] = [scenes[target], scenes[index]];
  return { project: { ...project, scenes }, index: target };
}

/** Quita una escena (siempre queda al menos una). */
export function removeScene(project: PromoProject, index: number): Edit {
  if (project.scenes.length <= 1 || index < 0 || index >= project.scenes.length) return { project, index };
  const scenes = project.scenes.filter((_, i) => i !== index);
  return { project: { ...project, scenes }, index: Math.min(index, scenes.length - 1) };
}

export function updateScene(project: PromoProject, index: number, patch: Partial<SceneSpec>): PromoProject {
  return { ...project, scenes: project.scenes.map((s, i) => (i === index ? clean({ ...s, ...patch }) : s)) };
}

const sameScenes = (a: SceneSpec[], b: SceneSpec[]) => JSON.stringify(a.map(clean)) === JSON.stringify(b.map(clean));

/**
 * Cambia de estilo: trae escenario, luz, tipografía y ritmo de la plantilla.
 * El guion y la duración sólo se reemplazan si la persona no los había tocado;
 * los textos se conservan siempre.
 */
export function applyTemplate(project: PromoProject, id: string): PromoProject {
  const current = templateById(project.template);
  const next = templateById(id);
  return {
    ...project,
    template: next.id,
    windowShadow: next.set === 'ventana' ? 0.45 : project.windowShadow,
    set: next.set,
    lighting: next.lighting,
    typography: next.typography,
    duration: project.duration === current.duration ? next.duration : project.duration,
    scenes: sameScenes(project.scenes, current.scenes) ? next.scenes.map(clean) : project.scenes,
  };
}

/** Instante que representa a una escena en la vista previa: con el título o el llamado a la acción ya visibles. */
export function sceneFocusTime(timeline: Timeline, sceneIndex: number): number {
  const scene = timeline.scenes.find((s) => s.index === sceneIndex) ?? timeline.scenes[0];
  if (!scene) return 0;
  const at = scene.kind === 'portada' ? 0.62 : scene.kind === 'cierre' || scene.kind === 'figuritas' ? 0.9 : 0.55;
  return scene.start + (scene.end - scene.start) * at;
}

/** Escena (índice en el proyecto) que se ve en el instante t. */
export function sceneAt(timeline: Timeline, t: number): number {
  const scene = timeline.scenes.find((s) => t < s.end) ?? timeline.scenes.at(-1);
  return scene?.index ?? 0;
}

const seconds = (s: number) => s.toFixed(1).replace('.', ',');

/** Aviso en palabras simples si las escenas quedan demasiado cortas para la duración elegida. */
export function pacingAdvice(timeline: Timeline): string | null {
  if (timeline.scenes.length === 0) return null;
  const shortest = Math.min(...timeline.scenes.map((s) => s.end - s.start));
  if (shortest >= 1.25) return null;
  return `Con ${timeline.scenes.length} escenas en ${Math.round(timeline.duration)} s, algunas duran ${seconds(shortest)} s y pasan muy rápido. Subí la duración o quitá alguna escena.`;
}

/** Páginas (numeradas como en el libro) de una doble página interior. */
export function spreadLabel(spread: number, pageCount: number): string {
  const left = 2 * spread;
  const right = 2 * spread + 1;
  return right <= pageCount ? `Págs. ${left}–${right}` : `Pág. ${left}`;
}
