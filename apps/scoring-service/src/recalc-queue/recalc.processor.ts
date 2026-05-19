/**
 * @file BullMQ worker — acquires a per-user mutex then runs `recalculateUser`.
 * @module @ghostless/scoring-service
 */

import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { ScoringService } from '../scoring/scoring.service';
import { RecalcEnqueuer, RecalcJobData } from './recalc-enqueuer.service';
import { LOCK_TTL_SECONDS, RECALC_QUEUE, RECALC_REDIS } from './recalc-queue.constants';

/**
 * Concurrency is set on the BullMQ Worker via env (`SCORING_RECALC_CONCURRENCY`),
 * so up to N *different* users recalc in parallel. Same-user concurrency is
 * blocked by the Redis SET-NX mutex; conflicts re-enqueue themselves.
 */
@Processor(RECALC_QUEUE, {
  concurrency: Number(process.env.SCORING_RECALC_CONCURRENCY) || 8,
})
export class RecalcProcessor extends WorkerHost {
  private readonly logger = new Logger(RecalcProcessor.name);

  constructor(
    private readonly scoring: ScoringService,
    private readonly enqueuer: RecalcEnqueuer,
    @Inject(RECALC_REDIS) private readonly redis: Redis,
  ) {
    super();
  }

  async process(job: Job<RecalcJobData>): Promise<void> {
    const { userId } = job.data;
    const lockKey = `recalc:lock:${userId}`;
    const token = randomUUID();

    const acquired = await this.redis.set(lockKey, token, 'EX', LOCK_TTL_SECONDS, 'NX');
    if (!acquired) {
      this.logger.debug(`Lock held for ${userId}; re-enqueueing`);
      await this.enqueuer.enqueue(userId);
      return;
    }

    try {
      const outcome = await this.scoring.recalculateUser(userId);
      if (outcome === 'stale') {
        // Another worker beat us on the optimistic-concurrency write — try again.
        await this.enqueuer.enqueue(userId);
      }
    } finally {
      await this.releaseIfOwned(lockKey, token);
    }
  }

  /** Release the lock only if we still own it (token match), via Lua. */
  private async releaseIfOwned(key: string, token: string): Promise<void> {
    const script = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      else
        return 0
      end`;
    try {
      await this.redis.eval(script, 1, key, token);
    } catch (err) {
      this.logger.warn(`Failed to release lock ${key}: ${(err as Error).message}`);
    }
  }

}
