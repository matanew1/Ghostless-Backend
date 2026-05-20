/**
 * @file Entry point for the auth service — OAuth login and JWT issuance.
 * @module @ghostless/auth-service
 */

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { json } from 'express';
import { setupApp } from '@ghostless/common';
import { AppModule } from './app.module';

/** Creates the Nest app with shared bootstrap helpers and listens on the configured port. */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.use(json({ limit: '50mb' }));
  setupApp(app, { title: 'Ghostless Auth Service' });
  const config = app.get(ConfigService);
  const port = config.get<number>('AUTH_SERVICE_PORT', 3001);
  await app.listen(port);
  console.log(`auth-service listening on :${port}`);
}

bootstrap();
