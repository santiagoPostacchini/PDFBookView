import { describe, expect, it } from 'vitest';
import { poseFromPosition, posePosition } from './framing';
describe('pose desde posicion y objetivo', () => {
  it.each([0, 12, 55, 86])('conserva elevacion %s y objetivo desplazado', (elevation) => {
    const pose = { azimuth: -47, elevation, distance: 12, target: [3, -2, 5] as const };
    const result = poseFromPosition(posePosition(pose), pose.target);
    expect(result.azimuth).toBeCloseTo(pose.azimuth);
    expect(result.elevation).toBeCloseTo(elevation);
    expect(result.distance).toBeCloseTo(12);
    expect(result.target).toEqual(pose.target);
  });
});
