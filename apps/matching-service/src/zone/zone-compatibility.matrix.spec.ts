/**
 * @file Unit tests for {@link ZoneCompatibilityMatrix} pairwise zone scores.
 * @module @ghostless/matching-service
 */

import { Zone } from '@ghostless/contracts';
import { ZoneCompatibilityMatrix } from './zone-compatibility.matrix';

describe('ZoneCompatibilityMatrix', () => {
  const matrix = new ZoneCompatibilityMatrix();

  it('same pulse zone scores highest', () => {
    expect(matrix.getScore(Zone.PULSE, Zone.PULSE)).toBe(1);
  });

  it('ghost town vs spark is zero', () => {
    expect(matrix.getScore(Zone.GHOST_TOWN, Zone.SPARK)).toBe(0);
  });
});
