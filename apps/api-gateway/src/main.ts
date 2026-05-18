/**
 * @file Entry point for the API gateway — HTTP server and Swagger docs.
 * @module @ghostless/api-gateway
 */

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

/** Creates the Nest app, mounts Swagger, and listens on the configured port. */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const config = new DocumentBuilder()
    .setTitle('Ghostless API Gateway')
    .setDescription('Routes traffic to microservices. See GET /docs/services for per-service Swagger.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  const port = app.get(ConfigService).get<number>('API_GATEWAY_PORT', 3000);
  await app.listen(port);
  console.log(`api-gateway listening on :${port}`);
}

bootstrap();
