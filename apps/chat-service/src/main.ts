/**
 * @file Entry point for the chat service — messages and WebSocket gateway.
 * @module @ghostless/chat-service
 */

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { setupApp } from '@ghostless/common';
import { AppModule } from './app.module';

/** Creates the Nest app with shared bootstrap helpers and listens on the configured port. */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  setupApp(app, { title: 'Ghostless Chat Service' });
  const port = app.get(ConfigService).get<number>('CHAT_SERVICE_PORT', 3003);
  await app.listen(port);
  console.log(`chat-service listening on :${port}`);
}

bootstrap();
