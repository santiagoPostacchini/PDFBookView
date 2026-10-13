import { sanitizeTextItems } from './textItems';
import { sceneDurations } from './compile';
import { LIGHTING_PRESETS } from '../book/Stage';
import { customScenarioColor, resolveCloth } from '../book/scenarios';
import { SET_PRESETS } from '../book/StageSet';
import { FORMATS, type BookShape, type FormatId, type PromoProject, type SceneLength, type SceneSpec, type TextItem } from './model';
import { projectFromTemplate, SCENES, TEMPLATES } from './templates';
import { sanitizeSceneCamera } from './sceneCamera';

/**
 * Guardado del video de cada álbum (como el plan de hojas: por nombre de
 * archivo) y de "Mi marca" (usuario y llamado a la acción), que se reutiliza en
 * cada álbum nuevo. Todo se valida al leer: un dato roto vuelve al valor por
 * defecto en vez de romper el editor.
 */

export interface VideoDraft {
  project: PromoProject;
  /** Formatos que se exportan juntos (el primero que se eligió es el de la vista previa). */
  formats: FormatId[];
}

export type BrandKit = { cta?: string; handle?: string };

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const VERSION = 2;
const draftKey = (fileName: string) => `pdf-book-view.video:${fileName.toLowerCase()}`;
const BRAND_KEY = 'pdf-book-view.marca';
const MAX_SCENES = 16;

function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number, fallback: string) => (typeof v === 'string' ? v.slice(0, max) : fallback);
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T => (options.includes(v as T) ? (v as T) : fallback);

const FORMAT_IDS = Object.keys(FORMATS) as FormatId[];
const LENGTHS: readonly SceneLength[] = ['corta', 'normal', 'larga'];

function sanitizeScene(raw: unknown): SceneSpec | null {
  if (!isObject(raw) || !(typeof raw.kind === 'string' && raw.kind in SCENES)) return null;
  const scene: SceneSpec = { kind: raw.kind as SceneSpec['kind'] };
  const camera = sanitizeSceneCamera(raw.camera);
  if (camera) scene.camera = camera;
  if (Number.isInteger(raw.spread) && (raw.spread as number) >= 1 && (raw.spread as number) <= 999) scene.spread = raw.spread as number;
  const length = oneOf(raw.length, LENGTHS, 'normal');
  if (length !== 'normal') scene.length = length;
  if (scene.kind === 'figuritas' && Array.isArray(raw.stickers)) {
    scene.stickers = raw.stickers.filter(isObject).flatMap((ref) => {
      if (typeof ref.id !== 'string' || !ref.id || ref.id.length > 100) return [];
      const clean: { id: string; slot?: number; page?: number } = { id: ref.id };
      if (Number.isInteger(ref.slot) && (ref.slot as number) > 0 && (ref.slot as number) <= 999) clean.slot = ref.slot as number;
      if (Number.isInteger(ref.page) && (ref.page as number) >= 2 && (ref.page as number) <= 999) clean.page = ref.page as number;
      return [clean];
    }).slice(0, 6);
  }
  return scene;
}

/** Proyecto válido a partir de cualquier cosa leída del almacenamiento (o null si no se parece a uno). */
export function sanitizeProject(raw: unknown): PromoProject | null {
  if (!isObject(raw)) return null;
  const template = TEMPLATES.find((t) => t.id === raw.template) ?? TEMPLATES[0];
  const base = projectFromTemplate(template.id);
  const scenes = Array.isArray(raw.scenes) ? raw.scenes.map(sanitizeScene).filter((s): s is SceneSpec => s !== null).slice(0, MAX_SCENES) : [];
  const duration = typeof raw.duration === 'number' && Number.isFinite(raw.duration) ? Math.max(6, Math.min(60, raw.duration)) : base.duration;
  const legacyCloth = typeof raw.set === 'string' && raw.set.startsWith('mantel-') && resolveCloth(raw.set) ? raw.set : undefined;
  const cloth = typeof raw.cloth === 'string' && resolveCloth(raw.cloth) ? raw.cloth : legacyCloth;
  return {
    windowShadow: typeof raw.windowShadow === 'number' && Number.isFinite(raw.windowShadow) ? Math.max(0, Math.min(1, raw.windowShadow)) : undefined,
    cloth,
    table: legacyCloth ? true : typeof raw.table === 'boolean' ? raw.table : undefined,
    ambientOcclusion: typeof raw.ambientOcclusion === 'number' && Number.isFinite(raw.ambientOcclusion) ? Math.max(0, Math.min(1, raw.ambientOcclusion)) : undefined,
    template: template.id,
    format: oneOf(raw.format, FORMAT_IDS, base.format),
    duration: Math.round(duration * 10) / 10,
    scenes: scenes.length ? scenes : base.scenes,
    textItems: Array.isArray(raw.textItems) ? sanitizeTextItems(raw.textItems) : base.textItems,
    set: typeof raw.set === 'string' && customScenarioColor(raw.set) ? raw.set : oneOf(
      raw.set,
      [...SET_PRESETS.map((s) => s.id), 'automatico'],
      base.set,
    ),
    lighting: oneOf(
      raw.lighting,
      LIGHTING_PRESETS.map((l) => l.id),
      base.lighting,
    ),
  };
}

function sanitizeFormats(raw: unknown, preview: FormatId): FormatId[] {
  const list = Array.isArray(raw) ? raw.filter((f): f is FormatId => FORMAT_IDS.includes(f as FormatId)) : [];
  const unique = [...new Set(list)];
  return unique.includes(preview) ? unique : [preview, ...unique];
}

/** Video nuevo para un álbum: plantilla Clásica con los textos de "Mi marca". */
export function newDraft(brand: BrandKit = {}, templateId = TEMPLATES[0].id): VideoDraft {
  const project = projectFromTemplate(templateId);
  project.textItems = sanitizeTextItems(project.textItems.map(item => ({ ...item, text: brand[item.id as keyof BrandKit] || item.text })));
  return { project, formats: [project.format] };
}

export function loadDraft(fileName: string, storage: StorageLike | null = defaultStorage(), book?: BookShape): VideoDraft | null {
  try {
    const raw = JSON.parse(storage?.getItem(draftKey(fileName)) ?? 'null');
    if (!isObject(raw) || (raw.version !== VERSION && raw.version !== 1)) return null;
    const project = raw.version === 1 ? migrateV1Project(raw.project, book) : sanitizeProject(raw.project);
    return project ? { project, formats: sanitizeFormats(raw.formats, project.format) } : null;
  } catch {
    return null;
  }
}

export function saveDraft(fileName: string, draft: VideoDraft, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(draftKey(fileName), JSON.stringify({ version: VERSION, ...draft }));
  } catch {
    /* sin almacenamiento: el editor sigue funcionando, sólo no recuerda */
  }
}

export function loadBrand(storage: StorageLike | null = defaultStorage()): BrandKit {
  try {
    const raw = JSON.parse(storage?.getItem(BRAND_KEY) ?? 'null');
    if (!isObject(raw)) return {};
    const brand: BrandKit = {};
    if (typeof raw.cta === 'string' && raw.cta) brand.cta = raw.cta.slice(0, 60);
    if (typeof raw.handle === 'string' && raw.handle) brand.handle = raw.handle.slice(0, 60);
    return brand;
  } catch {
    return {};
  }
}

export function saveBrand(brand: BrandKit, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(BRAND_KEY, JSON.stringify(brand));
  } catch {
    /* sin almacenamiento */
  }
}

/**
 * Migración liviana: conserva los pesos y mínimos de v1, sin calcular cámaras.
 * Sin medidas se presupone un libro con interiores; con medidas se omiten las
 * escenas que no puede abrir. Figuritas conserva su peso base porque sus assets
 * se cargan de manera asíncrona y no están en el borrador.
 */
export function migrateV1Project(raw: unknown, book?: BookShape): PromoProject | null {
  const project = sanitizeProject(raw);
  if (!project || !isObject(raw)) return null;
  const oldTexts = isObject(raw.texts) ? raw.texts : {};
  const template = TEMPLATES.find(t => t.id === project.template)!;
  const usable = project.scenes.map((scene, index) => ({ scene, index })).filter(({ scene }) => !book || book.leafCount >= 2 || scene.kind === 'portada' || scene.kind === 'cierre');
  const seeds = projectFromTemplate(project.template, { format: project.format }).textItems;
  const durations = sceneDurations(usable.map(({ scene: s }) => SCENES[s.kind].base * template.pace * ({ corta: 0.75, normal: 1, larga: 1.35 }[s.length ?? 'normal'])), project.duration,
    usable.map(({ scene: s }) => s.kind === 'portada' ? 2 : s.kind === 'cierre' ? 2.6 : 1.3));
  const font = typeof raw.typography === 'string' && ['clasica', 'moderna', 'manuscrita'].includes(raw.typography) ? `builtin:${raw.typography}` : project.textItems[0]?.font ?? 'builtin:clasica';
  const items: TextItem[] = [];
  let start = 0;
  usable.forEach(({ scene, index }, i) => {
    const end = start + durations[i];
    for (const id of i === 0 ? ['subtitle', 'title'] : []) {
      const seed = seeds.find(t => t.id === id)!;
      items.push({ ...seed, text: text(oldTexts[id], 120, seed.text), start, duration: durations[i], font });
    }
    if (scene.kind === 'cierre') for (const id of ['cta', 'handle']) {
      const seed = seeds.find(t => t.id === id)!;
      const at = start + Math.min(0.7, durations[i] * 0.25);
      items.push({ ...seed, id: `${id}-${i}`, text: text(oldTexts[id], 120, seed.text), start: at, duration: project.duration - at, font });
    }
    const oldScene = Array.isArray(raw.scenes) ? raw.scenes.filter(s => isObject(s) && typeof s.kind === 'string' && s.kind in SCENES)[index] : null;
    if (isObject(oldScene) && typeof oldScene.caption === 'string' && oldScene.caption.trim()) items.push({ id: `frase-${i}`, text: oldScene.caption, start: start + 0.3, duration: Math.max(0.5, durations[i] - 0.4), x: 0.5, y: 0.73, size: 0.035, color: 'auto', font, animation: 'subir', align: 'centro' });
    start = end;
  });
  return { ...project, textItems: sanitizeTextItems(items) };
}
