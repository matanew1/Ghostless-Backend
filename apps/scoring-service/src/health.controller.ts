/**
 * @file Health check and internal manual recalculation trigger.
 * @module @ghostless/scoring-service
 */

import { Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ScoringService } from './scoring/scoring.service';

/** Liveness and ops endpoints for the scoring service. */
@ApiTags('health')
@Controller()
export class HealthController {
  constructor(private readonly scoring: ScoringService) {}

  /** Returns service identity and ok status. */
  @Get('health')
  check() {
    return { status: 'ok', service: 'scoring-service' };
  }

  /** Triggers batch recalculation for recently active users. */
  @Post('internal/scoring/recalculate')
  async recalculate() {
    await this.scoring.recalculateAll();
    return { ok: true };
  }
}
