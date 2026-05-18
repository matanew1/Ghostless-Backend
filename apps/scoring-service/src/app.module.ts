/**
 * @file Root Nest module for the scoring service.
 * @module @ghostless/scoring-service
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@ghostless/database';
import { KafkaModule } from '@ghostless/kafka';
import { ScoringModule } from './scoring/scoring.module';
import { HealthController } from './health.controller';
import { MessageEventsConsumer } from './consumers/message-events.consumer';

/** Wires scoring domain, message Kafka consumers, and health/recalculate routes. */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    KafkaModule.forRootFromConfig('scoring'),
    ScoringModule,
  ],
  controllers: [HealthController],
  providers: [MessageEventsConsumer],
})
export class AppModule {}
