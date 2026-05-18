/**
 * @file Nest module for chat HTTP API, service layer, and WebSocket gateway.
 * @module @ghostless/chat-service
 */

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '@ghostless/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';

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
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway, JwtAuthGuard],
  exports: [ChatService],
})
export class ChatModule {}
