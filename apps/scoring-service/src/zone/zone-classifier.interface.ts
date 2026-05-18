/**
 * @file Contract for mapping computed metrics to a {@link Zone}.
 * @module @ghostless/scoring-service
 */

import { Zone } from '@ghostless/contracts';

/** Normalized metric inputs passed to zone classification rules. */
export interface MetricsInput {
  rts: number;
  eds: number;
  gi: number;
  reciprocity: number;
  totalMessages: number;
}

/** Strategy interface for zone assignment from metrics. */
export interface IZoneClassifier {
  /**
   * Derives the user's zone from current metric values.
   *
   * @param metrics - RTS, EDS, GI, reciprocity, and message count
   */
  classify(metrics: MetricsInput): Zone;
}
