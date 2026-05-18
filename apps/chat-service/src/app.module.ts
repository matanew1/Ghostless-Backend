/**
 * @file Root Nest module for the chat service.
 * @module @ghostless/chat-service
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@ghostless/database';
import { KafkaModule } from '@ghostless/kafka';
import { ChatModule } from './chat/chat.module';
import { HealthController } from './health.controller';
import { MatchCreatedConsumer } from './consumers/match-created.consumer';

/** Wires chat domain, match-created consumer, and health checks. */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    KafkaModule.forRootFromConfig('chat'),
    ChatModule,
  ],
  controllers: [HealthController],
  providers: [MatchCreatedConsumer],
})
export class AppModule {}
