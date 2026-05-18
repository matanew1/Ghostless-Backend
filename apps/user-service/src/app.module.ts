/**
 * @file Root Nest module for the user service.
 * @module @ghostless/user-service
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@ghostless/database';
import { KafkaModule } from '@ghostless/kafka';
import { UsersModule } from './users/users.module';
import { HealthController } from './health.controller';
import { ZoneChangedConsumer } from './consumers/zone-changed.consumer';

/** Wires users API, Kafka zone-change listener, and health checks. */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    KafkaModule.forRootFromConfig('user'),
    UsersModule,
  ],
  controllers: [HealthController],
  providers: [ZoneChangedConsumer],
})
export class AppModule {}
