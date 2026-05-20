/**
 * @file Entry point for the scoring service — metrics, zones, and batch recalculation.
 * @module @ghostless/scoring-service
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
  setupApp(app, { title: 'Ghostless Scoring Service', description: 'Internal metrics & zones' });
  const port = app.get(ConfigService).get<number>('SCORING_SERVICE_PORT', 3004);
  await app.listen(port);
  console.log(`scoring-service listening on :${port}`);
}

bootstrap();
