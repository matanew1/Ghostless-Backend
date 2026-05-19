/**
 * @file Nest module that registers the BullMQ refine queue and its worker.
 * @module @ghostless/chat-service
 */

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QuestionClassifierModule } from '@ghostless/common';
import { RefineEnqueuer } from './refine-enqueuer.service';
import { RefineProcessor } from './refine.processor';
import { REFINE_QUEUE } from './classify-queue.constants';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

/** Owns the chat-service's Redis-backed refine pipeline. */
@Module({
  imports: [
    BullModule.forRoot({
      connection: { url: REDIS_URL, maxRetriesPerRequest: null },
    }),
    BullModule.registerQueue({ name: REFINE_QUEUE }),
    QuestionClassifierModule,
  ],
  providers: [RefineEnqueuer, RefineProcessor],
  exports: [RefineEnqueuer],
})
export class ClassifyQueueModule {}
