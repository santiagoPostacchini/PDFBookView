import type { PromoProject, PromoTexts, SceneKind, SceneSpec, TypographyId } from './model';

/** Catálogo de escenas tal como se muestran en el guion (storyboard). */
export const SCENES: Record<SceneKind, { label: string; hint: string; base: number; usesSpread: boolean }> = {
  portada: { label: 'Portada', hint: 'Plano fijo de la tapa del álbum cerrado.', base: 2.6, usesSpread: false },
  apertura: { label: 'Apertura', hint: 'Se abre la tapa y aparece la primera página.', base: 2.4, usesSpread: false },
  doblePagina: { label: 'Doble página', hint: 'Una doble página completa desde un ángulo fijo.', base: 2.8, usesSpread: true },
  hojeo: { label: 'Hojeo', hint: 'Pasan varias hojas seguidas, vistas de costado.', base: 2.6, usesSpread: true },
  detalle: { label: 'Detalle', hint: 'Primer plano de una página, con fondo desenfocado.', base: 2.4, usesSpread: true },
  cenital: { label: 'Vista cenital', hint: 'Desde arriba, como una foto de producto plana.', base: 2.4, usesSpread: true },
  cierre: { label: 'Cierre', hint: 'El álbum se cierra y aparece tu llamado a la acción.', base: 3.0, usesSpread: false },
  figuritas: { label: 'Figuritas', hint: 'El paquete se abre y tus figuritas vuelan hasta su lugar en el álbum.', base: 6, usesSpread: false },
};

/**
 * Combinaciones de tipografías de los textos del video. Los archivos están
 * autoalojados en public/fonts/ (licencia OFL, ver scripts/fetch-fonts.mjs):
 * títulos en `display` 600, frases en `display` itálica 500 (Caveat no tiene
 * itálica: va recta) y líneas chicas en `body` 500.
 */
export const TYPOGRAPHY: Record<TypographyId, { label: string; display: string; body: string; displayWeight: number; italic: boolean }> = {
  clasica: { label: 'Clásica', display: 'Cormorant Garamond', body: 'Jost', displayWeight: 600, italic: true },
  moderna: { label: 'Moderna', display: 'Fraunces', body: 'Manrope', displayWeight: 600, italic: true },
  manuscrita: { label: 'Manuscrita', display: 'Caveat', body: 'Jost', displayWeight: 600, italic: false },
};

export type Transition = 'continua' | 'corte';

export interface Template {
  id: string;
  label: string;
  description: string;
  /** Montaje con cortes entre planos fijos. */
  transition: Transition;
  /** Multiplicador de duración de las escenas (ritmo). */
  pace: number;
  flipSpeed: number;
  set: string;
  lighting: string;
  typography: TypographyId;
  /** Desenfoque de fondo base (0..1); el detalle suma más. */
  aperture: number;
  vignette: number;
  grain: number;
  duration: number;
  scenes: SceneSpec[];
}

export const TEMPLATES: Template[] = [
  {
    id: 'clasica',
    label: 'Clásica',
    description: 'Estudio cálido, planos fijos y títulos con serifa.',
    transition: 'corte',
    pace: 1,
    flipSpeed: 0.8,
    set: 'arena',
    lighting: 'suave',
    typography: 'clasica',
    aperture: 0.35,
    vignette: 0.22,
    grain: 0.05,
    duration: 15,
    scenes: [
      { kind: 'portada' },
      { kind: 'apertura' },
      { kind: 'doblePagina', caption: 'Tus fotos, tu historia' },
      { kind: 'hojeo' },
      { kind: 'detalle' },
      { kind: 'cenital', caption: 'Impreso y armado a mano' },
      { kind: 'cierre' },
    ],
  },
  {
    id: 'ritmo',
    label: 'Ritmo',
    description: 'Planos fijos cortos con cortes directos, ideal para Reels.',
    transition: 'corte',
    pace: 0.8,
    flipSpeed: 1.15,
    set: 'rosa',
    lighting: 'calida',
    typography: 'moderna',
    aperture: 0.3,
    vignette: 0.18,
    grain: 0.04,
    duration: 10,
    scenes: [
      { kind: 'portada' },
      { kind: 'apertura' },
      { kind: 'hojeo' },
      { kind: 'doblePagina', caption: 'Diseño personalizado' },
      { kind: 'detalle' },
      { kind: 'cierre' },
    ],
  },
  {
    id: 'minimal',
    label: 'Minimal',
    description: 'Fondo liso, vistas desde arriba y casi sin texto.',
    transition: 'corte',
    pace: 1.15,
    flipSpeed: 0.75,
    set: 'salvia',
    lighting: 'suave',
    typography: 'moderna',
    aperture: 0.15,
    vignette: 0.12,
    grain: 0,
    duration: 12,
    scenes: [{ kind: 'portada' }, { kind: 'apertura' }, { kind: 'cenital' }, { kind: 'doblePagina' }, { kind: 'cierre' }],
  },
  {
    id: 'figuritas', label: 'Figuritas', description: 'Tus recuerdos salen del paquete y se pegan en el álbum.',
    transition: 'corte', pace: 1, flipSpeed: 1, set: 'rosa', lighting: 'suave', typography: 'manuscrita',
    aperture: 0.15, vignette: 0.15, grain: 0.02, duration: 20,
    scenes: [{ kind: 'portada' }, { kind: 'apertura' }, { kind: 'doblePagina' }, { kind: 'figuritas' }, { kind: 'detalle' }, { kind: 'cierre' }],
  },
  {
    id: 'ventana', label: 'Luz de ventana', description: 'Lino cálido y sombras de una ventana sobre el papel.',
    transition: 'corte', pace: 1.1, flipSpeed: 0.8, set: 'ventana', lighting: 'calida', typography: 'clasica',
    aperture: 0.25, vignette: 0.15, grain: 0.02, duration: 15,
    scenes: [{ kind: 'portada' }, { kind: 'apertura' }, { kind: 'doblePagina' }, { kind: 'cenital' }, { kind: 'cierre' }],
  },
];

export const DEFAULT_TEXTS: PromoTexts = {
  title: 'Álbum personalizado',
  subtitle: 'Hecho a mano, página por página',
  cta: 'Pedí el tuyo',
  handle: '@tu.marca',
};

export function templateById(id: string): Template {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}

/** Proyecto inicial a partir de una plantilla (lo que ve la persona antes de tocar nada). */
export function projectFromTemplate(id: string, overrides: Partial<PromoProject> = {}): PromoProject {
  const t = templateById(id);
  return {
    template: t.id,
    format: '9:16',
    duration: t.duration,
    scenes: t.scenes.map((s) => ({ ...s })),
    texts: { ...DEFAULT_TEXTS },
    typography: t.typography,
    set: t.set,
    lighting: t.lighting,
    ...overrides,
  };
}
