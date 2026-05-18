/**
 * @file Unit tests for {@link ZoneClassifier} zone assignment rules and thresholds.
 * @module @ghostless/scoring-service
 */

import { Zone } from '@ghostless/contracts';
import { ZoneClassifier } from './zone-classifier';

describe('ZoneClassifier', () => {
  const classifier = new ZoneClassifier();

  it('returns UNMAPPED below message threshold', () => {
    expect(
      classifier.classify({ rts: 0.9, eds: 0.9, gi: 0, reciprocity: 0.9, totalMessages: 2 }),
    ).toBe(Zone.UNMAPPED);
  });

  it('classifies ghost town pattern', () => {
    expect(
      classifier.classify({ rts: 0.2, eds: 0.3, gi: 0.8, reciprocity: 0.2, totalMessages: 20 }),
    ).toBe(Zone.GHOST_TOWN);
  });

  it('classifies spark pattern', () => {
    expect(
      classifier.classify({ rts: 0.9, eds: 0.8, gi: 0.1, reciprocity: 0.8, totalMessages: 30 }),
    ).toBe(Zone.SPARK);
  });
});
