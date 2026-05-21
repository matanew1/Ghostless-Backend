/**
 * @file Rule-based zone classifier (Ghost Town, Chill, Steady, Pulse, Spark).
 * @module @ghostless/scoring-service
 */

import { Injectable } from '@nestjs/common';
import { Zone } from '@ghostless/contracts';
import { IZoneClassifier, MetricsInput } from './zone-classifier.interface';

/**
 * Assigns a {@link Zone} from RTS/EDS/GI/reciprocity thresholds.
 * New users start at STEADY (the center of the spectrum) until they accumulate
 * enough messages to be accurately classified.
 */
@Injectable()
export class ZoneClassifier implements IZoneClassifier {
  private readonly minMessages = 5;

  /**
   * Evaluates metric thresholds in priority order (ghost → spark → pulse → chill → steady).
   *
   * @param metrics - Current user metrics snapshot
   */
  classify(metrics: MetricsInput): Zone {
    if (metrics.totalMessages < this.minMessages) {
      return Zone.STEADY;
    }

    const { rts, eds, gi, reciprocity } = metrics;

    if (gi > 0.6 && rts < 0.35 && reciprocity < 0.4) {
      return Zone.GHOST_TOWN;
    }
    if (rts >= 0.75 && eds >= 0.65) {
      return Zone.SPARK;
    }
    if (rts >= 0.65 && eds < 0.55) {
      return Zone.PULSE;
    }
    if (rts >= 0.4 && rts < 0.65 && eds >= 0.4 && eds < 0.7) {
      return Zone.STEADY;
    }
    if (rts < 0.45 && reciprocity >= 0.4) {
      return Zone.CHILL;
    }

    return Zone.STEADY;
  }
}
