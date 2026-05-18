/**
 * @file Entry point for the user service — profiles, onboarding, and zones.
 * @module @ghostless/user-service
 */

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { setupApp } from '@ghostless/common';
import { AppModule } from './app.module';

/** Creates the Nest app with shared bootstrap helpers and listens on the configured port. */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  setupApp(app, { title: 'Ghostless User Service' });
  const port = app.get(ConfigService).get<number>('USER_SERVICE_PORT', 3002);
  await app.listen(port);
  console.log(`user-service listening on :${port}`);
}

bootstrap();
