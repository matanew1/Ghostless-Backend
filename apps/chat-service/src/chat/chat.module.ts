/**
 * @file Nest module for chat HTTP API, service layer, and WebSocket gateway.
 * @module @ghostless/chat-service
 */

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtAuthGuard, QuestionClassifierModule } from '@ghostless/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { ClassifyQueueModule } from '../classify-queue/classify-queue.module';

/** Chat domain — exports {@link ChatService} for gateway injection. */
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
    QuestionClassifierModule,
    ClassifyQueueModule,
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway, JwtAuthGuard],
  exports: [ChatService],
})
export class ChatModule {}
