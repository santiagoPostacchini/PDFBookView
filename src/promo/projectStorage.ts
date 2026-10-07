import { LIGHTING_PRESETS } from '../book/Stage';
import { SET_PRESETS } from '../book/StageSet';
import { FORMATS, type FormatId, type PromoProject, type PromoTexts, type SceneLength, type SceneSpec, type TypographyId } from './model';
import { DEFAULT_TEXTS, projectFromTemplate, SCENES, TEMPLATES, TYPOGRAPHY } from './templates';

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

export type BrandKit = Partial<Pick<PromoTexts, 'cta' | 'handle'>>;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const VERSION = 1;
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
  if (Number.isInteger(raw.spread) && (raw.spread as number) >= 1 && (raw.spread as number) <= 999) scene.spread = raw.spread as number;
  if (typeof raw.caption === 'string' && raw.caption.trim()) scene.caption = raw.caption.slice(0, 80);
  const length = oneOf(raw.length, LENGTHS, 'normal');
  if (length !== 'normal') scene.length = length;
  return scene;
}

/** Proyecto válido a partir de cualquier cosa leída del almacenamiento (o null si no se parece a uno). */
export function sanitizeProject(raw: unknown): PromoProject | null {
  if (!isObject(raw)) return null;
  const template = TEMPLATES.find((t) => t.id === raw.template) ?? TEMPLATES[0];
  const base = projectFromTemplate(template.id);
  const scenes = Array.isArray(raw.scenes) ? raw.scenes.map(sanitizeScene).filter((s): s is SceneSpec => s !== null).slice(0, MAX_SCENES) : [];
  const texts = isObject(raw.texts) ? raw.texts : {};
  const duration = typeof raw.duration === 'number' && Number.isFinite(raw.duration) ? Math.max(6, Math.min(60, raw.duration)) : base.duration;
  return {
    template: template.id,
    format: oneOf(raw.format, FORMAT_IDS, base.format),
    duration: Math.round(duration * 10) / 10,
    scenes: scenes.length ? scenes : base.scenes,
    texts: {
      title: text(texts.title, 60, DEFAULT_TEXTS.title),
      subtitle: text(texts.subtitle, 60, DEFAULT_TEXTS.subtitle),
      cta: text(texts.cta, 60, DEFAULT_TEXTS.cta),
      handle: text(texts.handle, 60, DEFAULT_TEXTS.handle),
    },
    typography: oneOf(raw.typography, Object.keys(TYPOGRAPHY) as TypographyId[], base.typography),
    set: oneOf(
      raw.set,
      SET_PRESETS.map((s) => s.id),
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
  project.texts = { ...project.texts, ...Object.fromEntries(Object.entries(brand).filter(([, v]) => typeof v === 'string' && v)) };
  return { project, formats: [project.format] };
}

export function loadDraft(fileName: string, storage: StorageLike | null = defaultStorage()): VideoDraft | null {
  try {
    const raw = JSON.parse(storage?.getItem(draftKey(fileName)) ?? 'null');
    if (!isObject(raw) || raw.version !== VERSION) return null;
    const project = sanitizeProject(raw.project);
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
