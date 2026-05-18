/**
 * @file Scheduled cron job triggering batch user metrics recalculation.
 * @module @ghostless/scoring-service
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ScoringService } from './scoring.service';

/** Runs {@link ScoringService.recalculateAll} every five minutes. */
@Injectable()
export class ScoringJob {
  private readonly logger = new Logger(ScoringJob.name);

  constructor(private readonly scoring: ScoringService) {}

  /** Cron handler — logs start and delegates to scoring service. */
  @Cron('*/5 * * * *')
  async handleCron(): Promise<void> {
    this.logger.log('Starting batch scoring recalculation');
    await this.scoring.recalculateAll();
  }
}
