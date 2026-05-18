/**
 * @file Pairwise zone compatibility scores used in discovery and match scoring.
 * @module @ghostless/matching-service
 */

import { Zone, toDisplayZone } from '@ghostless/contracts';

/** Symmetric lookup table: row zone × column zone → alignment score in [0, 1]. */
const MATRIX: Record<Zone, Record<Zone, number>> = {
  [Zone.GHOST_TOWN]: {
    [Zone.GHOST_TOWN]: 1.0,
    [Zone.CHILL]: 0.7,
    [Zone.STEADY]: 0.4,
    [Zone.PULSE]: 0.1,
    [Zone.SPARK]: 0.0,
    [Zone.UNMAPPED]: 0.7,
  },
  [Zone.CHILL]: {
    [Zone.GHOST_TOWN]: 0.7,
    [Zone.CHILL]: 1.0,
    [Zone.STEADY]: 0.8,
    [Zone.PULSE]: 0.4,
    [Zone.SPARK]: 0.2,
    [Zone.UNMAPPED]: 1.0,
  },
  [Zone.STEADY]: {
    [Zone.GHOST_TOWN]: 0.4,
    [Zone.CHILL]: 0.8,
    [Zone.STEADY]: 1.0,
    [Zone.PULSE]: 0.7,
    [Zone.SPARK]: 0.5,
    [Zone.UNMAPPED]: 0.8,
  },
  [Zone.PULSE]: {
    [Zone.GHOST_TOWN]: 0.1,
    [Zone.CHILL]: 0.4,
    [Zone.STEADY]: 0.7,
    [Zone.PULSE]: 1.0,
    [Zone.SPARK]: 0.8,
    [Zone.UNMAPPED]: 0.4,
  },
  [Zone.SPARK]: {
    [Zone.GHOST_TOWN]: 0.0,
    [Zone.CHILL]: 0.2,
    [Zone.STEADY]: 0.5,
    [Zone.PULSE]: 0.8,
    [Zone.SPARK]: 1.0,
    [Zone.UNMAPPED]: 0.2,
  },
  [Zone.UNMAPPED]: {
    [Zone.GHOST_TOWN]: 0.7,
    [Zone.CHILL]: 1.0,
    [Zone.STEADY]: 0.8,
    [Zone.PULSE]: 0.4,
    [Zone.SPARK]: 0.2,
    [Zone.UNMAPPED]: 1.0,
  },
};

/** Reads precomputed zone-pair compatibility from {@link MATRIX}. */
export class ZoneCompatibilityMatrix {
  /**
   * Returns alignment score between two zones (after display normalization).
   *
   * @param zoneA - First user's zone
   * @param zoneB - Second user's zone
   */
  getScore(zoneA: Zone, zoneB: Zone): number {
    const a = toDisplayZone(zoneA);
    const b = toDisplayZone(zoneB);
    return MATRIX[a][b] ?? 0;
  }
}
