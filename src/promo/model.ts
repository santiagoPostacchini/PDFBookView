/**
 * Proyecto de video promocional: lo que decide la persona usuaria, en términos
 * que entiende cualquiera (escenas, textos, formato). El "cómo" (cámara, luces,
 * tiempos exactos) lo resuelve `compile.ts` a partir de la plantilla.
 */

export type SceneKind = 'portada' | 'apertura' | 'doblePagina' | 'hojeo' | 'detalle' | 'cenital' | 'cierre';

export type SceneLength = 'corta' | 'normal' | 'larga';

export interface SceneSpec {
  kind: SceneKind;
  /** Doble página que muestra (escenas con páginas). Si falta, se elige sola. */
  spread?: number;
  /** Frase en pantalla durante la escena (opcional). */
  caption?: string;
  length?: SceneLength;
}

export type FormatId = '9:16' | '4:5' | '1:1' | '16:9';

export const FORMATS: Record<FormatId, { width: number; height: number; label: string; hint: string }> = {
  '9:16': { width: 1080, height: 1920, label: '9:16', hint: 'Reels, TikTok, historias' },
  '4:5': { width: 1080, height: 1350, label: '4:5', hint: 'Publicación en el feed' },
  '1:1': { width: 1080, height: 1080, label: '1:1', hint: 'Feed y catálogos' },
  '16:9': { width: 1920, height: 1080, label: '16:9', hint: 'YouTube y la web' },
};

export interface PromoTexts {
  /** Título de apertura. */
  title: string;
  /** Línea chica sobre el título. */
  subtitle: string;
  /** Llamado a la acción del cierre. */
  cta: string;
  /** Usuario o web de la marca. */
  handle: string;
}

export type TypographyId = 'clasica' | 'moderna' | 'manuscrita';

export interface PromoProject {
  template: string;
  format: FormatId;
  /** Duración objetivo en segundos (las escenas se reparten ese tiempo). */
  duration: number;
  scenes: SceneSpec[];
  texts: PromoTexts;
  typography: TypographyId;
  /** Escenario: id de SET_PRESETS. */
  set: string;
  /** Luz: id de LIGHTING_PRESETS. */
  lighting: string;
}

/** Medidas del libro que necesita el compilador (no depende de three.js). */
export interface BookShape {
  leafCount: number;
  pageWidth: number;
  pageHeight: number;
}
