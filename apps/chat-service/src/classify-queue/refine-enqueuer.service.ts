/**
 * @file Enqueues background HF-refine jobs for newly-persisted messages.
 * @module @ghostless/chat-service
 */

import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { REFINE_QUEUE } from './classify-queue.constants';

/** Job payload — everything the worker needs without re-fetching from DB. */
export interface RefineJobData {
  messageId: string;
  content: string;
  /** Heuristic verdict at send time; worker only updates the row if HF disagrees. */
  heuristicVerdict: boolean;
}

/**
 * Wraps the BullMQ queue with a dedupe-by-messageId enqueue.
 * Same message re-enqueued (e.g. duplicate Kafka delivery) is a no-op.
 */
@Injectable()
export class RefineEnqueuer {
  constructor(@InjectQueue(REFINE_QUEUE) private readonly queue: Queue<RefineJobData>) {}

  /** Add a refine job for one message. */
  async enqueue(data: RefineJobData): Promise<void> {
    await this.queue.add('refine', data, {
      jobId: `refine-${data.messageId}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
    });
  }
}
