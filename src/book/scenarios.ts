import type { StageSetSpec, Surface } from './StageSet';

/** Fondos compartidos por Foto y Video; los manteles tienen su propio catálogo. */
export const SCENARIOS: readonly (StageSetSpec & { id: string; label: string })[] = [
  { id: 'arena', label: 'Arena', color: '#dcc6a8', surface: 'papel' },
  { id: 'lino', label: 'Lino', color: '#ddd3c4', surface: 'lino' },
  { id: 'salvia', label: 'Salvia', color: '#bcc7ae', surface: 'papel' },
  { id: 'rosa', label: 'Rosa', color: '#e9c6c2', surface: 'papel' },
  { id: 'carbon', label: 'Carbón', color: '#3b3734', surface: 'papel' },
  { id: 'noche', label: 'Noche', color: '#28324c', surface: 'papel' },
  { id: 'crema', label: 'Crema', color: '#f6f0e5', surface: 'papel' },
  { id: 'blanco', label: 'Blanco', color: '#ffffff', surface: 'papel' },
  { id: 'ventana', label: 'Luz de ventana', color: '#e7d5b9', surface: 'lino', windowShadow: true },
];

export const CLOTHS: readonly (NonNullable<StageSetSpec['cloth']> & { id: string; label: string; surface: Surface })[] = [
  { id: 'mantel-rosa', label: 'Cuadros rosa', color: '#f4e9dc', surface: 'lino', tablecloth: 'vichy-rosa' },
  { id: 'mantel-azul', label: 'Cuadros azul', color: '#f4e9dc', surface: 'lino', tablecloth: 'vichy-azul' },
  { id: 'mantel-rayas', label: 'Rayas salvia', color: '#f4e9dc', surface: 'lino', tablecloth: 'rayas-salvia' },
  { id: 'liso', label: 'Liso', color: '#f4e9dc', surface: 'liso' },
  { id: 'lino', label: 'Lino', color: '#ddd3c4', surface: 'lino' },
  { id: 'papel', label: 'Papel', color: '#dcc6a8', surface: 'papel' },
];

export function resolveCloth(id?: string) {
  if (!id) return undefined;
  const color = customScenarioColor(id);
  return color ? { color, surface: 'liso' as Surface } : CLOTHS.find((c) => c.id === id);
}

export const LEGACY_PHOTO_COLORS: Record<string, string> = {
  carbon: '#3d3832', crema: '#f6f0e5', rosa: '#fbdde3', salvia: '#e1e8da', noche: '#2a3552', blanco: '#ffffff',
};

export function customScenarioColor(id: string): string | null {
  return /^color:#[\da-f]{6}$/i.test(id) ? id.slice(6) : null;
}

export function resolveScenario(id: string): StageSetSpec | undefined {
  const color = customScenarioColor(id);
  return color ? { color, surface: 'papel' } : SCENARIOS.find((s) => s.id === id);
}

/** Sólo los ajustes anteriores al catálogo se migran; la superficie queda intacta. */
export function migratePhotoBackdrop(backdrop: string, catalogVersion?: number): string {
  return (catalogVersion ?? 0) >= 1 || !LEGACY_PHOTO_COLORS[backdrop] ? backdrop : `foto:${backdrop}`;
}


/** Migra el entorno de Foto sin volver a migrar los colores del catálogo v1. */
export function migratePhotoEnvironment(saved: { backdrop: string; catalogVersion?: number; cloth?: string; table?: boolean }, defaultBackdrop = 'carbon') {
  const legacyCloth = saved.backdrop.startsWith('mantel-') && resolveCloth(saved.backdrop) ? saved.backdrop : undefined;
  return {
    backdrop: legacyCloth ? defaultBackdrop : migratePhotoBackdrop(saved.backdrop, saved.catalogVersion),
    cloth: legacyCloth ?? (resolveCloth(saved.cloth) ? saved.cloth : undefined),
    table: !!legacyCloth || saved.table === true,
    catalogVersion: 2,
  };
}

export function photoScenario(backdrop: string, customColor: string, surface: Surface, table?: boolean, cloth?: string): StageSetSpec | null {
  if (backdrop === 'transparent') return null;
  const legacy = backdrop.startsWith('foto:') ? LEGACY_PHOTO_COLORS[backdrop.slice(5)] : undefined;
  const resolvedCloth = resolveCloth(cloth);
  const environment = { ...(table !== undefined ? { table } : {}), ...(resolvedCloth ? { cloth: resolvedCloth } : {}) };
  if (legacy || backdrop === 'custom') return { color: legacy ?? customColor, surface, ...environment };
  const spec = resolveScenario(backdrop) ?? { color: LEGACY_PHOTO_COLORS.carbon, surface };
  return { ...spec, surface, ...environment };
}

/** Fondo de Foto guardado antes del catálogo: conserva su color y se muestra aparte, sin confundirlo con el del catálogo. */
export function legacyPhotoSwatch(backdrop: string): { id: string; label: string; color: string } | null {
  if (!backdrop.startsWith('foto:')) return null;
  const name = backdrop.slice(5);
  const color = LEGACY_PHOTO_COLORS[name];
  if (!color) return null;
  const label = SCENARIOS.find((s) => s.id === name)?.label ?? name;
  return { id: backdrop, label: `${label} (anterior)`, color };
}
