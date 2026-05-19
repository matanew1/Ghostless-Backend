/**
 * @file Health check and internal manual recalculation trigger.
 * @module @ghostless/scoring-service
 */

import { Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ScoringService } from './scoring/scoring.service';
import { RecalcEnqueuer } from './recalc-queue/recalc-enqueuer.service';

/** Liveness and ops endpoints for the scoring service. */
@ApiTags('health')
@Controller()
export class HealthController {
  constructor(
    private readonly scoring: ScoringService,
    private readonly enqueuer: RecalcEnqueuer,
  ) {}

  /** Returns service identity and ok status. */
  @Get('health')
  check() {
    return { status: 'ok', service: 'scoring-service' };
  }

  /** Enqueues recalculation jobs for recently active users via the BullMQ queue. */
  @Post('internal/scoring/recalculate')
  async recalculate() {
    let count = 0;
    for await (const userId of this.scoring.streamActiveUserIds()) {
      await this.enqueuer.enqueue(userId);
      count++;
    }
    return { ok: true, enqueued: count };
  }
}
