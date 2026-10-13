import { SET_PRESETS, type StageSetSpec } from '../book/StageSet';
import { resolveCloth, resolveScenario } from '../book/scenarios';
import type { Timeline } from './compile';
import { packTableBounds } from './figuritas/choreography';
export function timelineSet(timeline: Timeline): StageSetSpec {
  const base: StageSetSpec = timeline.set === 'automatico' ? { color: timeline.coverColor ?? '#dcc6a8', surface: 'papel' }
    : resolveScenario(timeline.set) ?? SET_PRESETS[0];
  const strength = timeline.windowShadow ?? (base.windowShadow ? 0.45 : 0);
  const bounds = (timeline.shows ?? []).map((show) => packTableBounds(show, true));
  const tableSize = bounds.length ? {
    width: 2 * Math.max(...bounds.map((b) => Math.max(Math.abs(b.minX), Math.abs(b.maxX)) + 0.4)),
    depth: 2 * Math.max(...bounds.map((b) => Math.max(Math.abs(b.minZ), Math.abs(b.maxZ)) + 0.4)),
  } : undefined;
  return { ...base, cloth: resolveCloth(timeline.cloth), ...(tableSize ? { tableSize } : {}), table: timeline.table ?? true, windowShadow: strength > 0, windowStrength: strength };
}
