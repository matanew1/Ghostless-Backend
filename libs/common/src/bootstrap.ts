/**
 * @file Shared Nest application bootstrap (validation + Swagger).
 * @module @ghostless/common
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** Options for OpenAPI setup on each microservice. */
export interface SwaggerOptions {
  title: string;
  description?: string;
}

/**
 * Applies global validation and mounts Swagger UI at `/docs`.
 *
 * @param app - Nest application instance
 * @param swagger - OpenAPI metadata
 */
export function setupApp(app: INestApplication, swagger: SwaggerOptions): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle(swagger.title)
    .setDescription(swagger.description ?? 'Ghostless API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
}
