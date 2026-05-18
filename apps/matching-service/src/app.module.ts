/**
 * @file Root Nest module for the matching service.
 * @module @ghostless/matching-service
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@ghostless/database';
import { KafkaModule } from '@ghostless/kafka';
import { MatchingModule } from './matching/matching.module';
import { HealthController } from './health.controller';
import { ZoneChangedConsumer } from './consumers/zone-changed.consumer';

/** Wires matching API, zone-change consumer, and health checks. */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    KafkaModule.forRootFromConfig('matching'),
    MatchingModule,
  ],
  controllers: [HealthController],
  providers: [ZoneChangedConsumer],
})
export class AppModule {}
