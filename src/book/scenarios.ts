import type { StageSetSpec, Surface } from './StageSet';

/** Catálogo común; los ids históricos de Video conservan su aspecto. */
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
  { id: 'mantel-rosa', label: 'Mantel · cuadros rosa', color: '#f4e9dc', surface: 'lino', tablecloth: 'vichy-rosa' },
  { id: 'mantel-azul', label: 'Mantel · cuadros azul', color: '#f4e9dc', surface: 'lino', tablecloth: 'vichy-azul' },
  { id: 'mantel-rayas', label: 'Mantel · rayas salvia', color: '#f4e9dc', surface: 'lino', tablecloth: 'rayas-salvia' },
];

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
  return catalogVersion === 1 || !LEGACY_PHOTO_COLORS[backdrop] ? backdrop : `foto:${backdrop}`;
}

export function photoScenario(backdrop: string, customColor: string, surface: Surface): StageSetSpec | null {
  if (backdrop === 'transparent') return null;
  const legacy = backdrop.startsWith('foto:') ? LEGACY_PHOTO_COLORS[backdrop.slice(5)] : undefined;
  if (legacy || backdrop === 'custom') return { color: legacy ?? customColor, surface };
  const spec = resolveScenario(backdrop) ?? { color: LEGACY_PHOTO_COLORS.carbon, surface };
  return spec.tablecloth || spec.windowShadow ? spec : { ...spec, surface };
}
