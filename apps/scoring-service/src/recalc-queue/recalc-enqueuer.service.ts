/**
 * @file Adds debounced, deduped recalc jobs to the BullMQ queue.
 * @module @ghostless/scoring-service
 */

import { Inject, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DEFAULT_DEBOUNCE_MS, RECALC_QUEUE } from './recalc-queue.constants';

/** Job payload shape stored in BullMQ. */
export interface RecalcJobData {
  userId: string;
}

/**
 * `jobId: recalc-${userId}` dedupes any pending job for the same user.
 * (BullMQ disallows `:` in custom job ids.)
 * A burst of N events collapses into one recalc ~`debounceMs` later.
 */
@Injectable()
export class RecalcEnqueuer {
  constructor(
    @InjectQueue(RECALC_QUEUE) private readonly queue: Queue<RecalcJobData>,
    @Inject('RECALC_DEBOUNCE_MS') private readonly debounceMs: number = DEFAULT_DEBOUNCE_MS,
  ) {}

  /** Enqueue (or no-op if already pending) a recalc for one user. */
  async enqueue(userId: string): Promise<void> {
    await this.queue.add(
      'recalc',
      { userId },
      {
        jobId: `recalc-${userId}`,
        delay: this.debounceMs,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 100 },
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
      },
    );
  }
}
