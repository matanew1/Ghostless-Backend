/**
 * @file Hourly safety-net cron that re-enqueues recalc jobs for active users.
 * @module @ghostless/scoring-service
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ScoringService } from './scoring.service';
import { RecalcEnqueuer } from '../recalc-queue/recalc-enqueuer.service';

/**
 * Primary recalc path is the BullMQ queue driven by Kafka events.
 * This cron exists only to repair drift from missed events by re-enqueueing
 * active users hourly; it never calls `recalculateUser` directly.
 */
@Injectable()
export class ScoringJob {
  private readonly logger = new Logger(ScoringJob.name);

  constructor(
    private readonly scoring: ScoringService,
    private readonly enqueuer: RecalcEnqueuer,
  ) {}

  /** Cron handler — streams active user ids into the recalc queue. */
  @Cron('0 * * * *')
  async handleCron(): Promise<void> {
    this.logger.log('Starting hourly safety-net recalc enqueue');
    let count = 0;
    for await (const userId of this.scoring.streamActiveUserIds()) {
      await this.enqueuer.enqueue(userId);
      count++;
    }
    this.logger.log(`Enqueued ${count} active users for recalc`);
  }
}
