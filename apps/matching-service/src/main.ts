/**
 * @file Entry point for the matching service — discovery, interest, and matches.
 * @module @ghostless/matching-service
 */

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { setupApp } from '@ghostless/common';
import { AppModule } from './app.module';

/** Creates the Nest app with shared bootstrap helpers and listens on the configured port. */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  setupApp(app, { title: 'Ghostless Matching Service' });
  const port = app.get(ConfigService).get<number>('MATCHING_SERVICE_PORT', 3005);
  await app.listen(port);
  console.log(`matching-service listening on :${port}`);
}

bootstrap();
