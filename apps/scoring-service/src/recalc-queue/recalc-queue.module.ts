/**
 * @file Nest module registering the BullMQ recalc queue, worker, and shared Redis client.
 * @module @ghostless/scoring-service
 */

import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import Redis from 'ioredis';
import { RecalcEnqueuer } from './recalc-enqueuer.service';
import { RecalcProcessor } from './recalc.processor';
import {
  DEFAULT_DEBOUNCE_MS,
  RECALC_QUEUE,
  RECALC_REDIS,
} from './recalc-queue.constants';
import { ScoringModule } from '../scoring/scoring.module';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

/** BullMQ + shared ioredis client; exports {@link RecalcEnqueuer} for consumers. */
@Global()
@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        url: REDIS_URL,
        maxRetriesPerRequest: null,
      },
    }),
    BullModule.registerQueue({ name: RECALC_QUEUE }),
    ScoringModule,
  ],
  providers: [
    {
      provide: RECALC_REDIS,
      useFactory: () => new Redis(REDIS_URL, { maxRetriesPerRequest: null }),
    },
    {
      provide: 'RECALC_DEBOUNCE_MS',
      useValue: Number(process.env.SCORING_RECALC_DEBOUNCE_MS) || DEFAULT_DEBOUNCE_MS,
    },
    RecalcEnqueuer,
    RecalcProcessor,
  ],
  exports: [RecalcEnqueuer],
})
export class RecalcQueueModule {}
