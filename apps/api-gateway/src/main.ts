/**
 * @file Entry point for the API gateway — HTTP server and Swagger docs.
 * @module @ghostless/api-gateway
 */

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { AppModule } from './app.module';

/** Creates the Nest app, mounts Swagger, and listens on the configured port. */
async function bootstrap(): Promise<void> {
  // Disable built-in body parser so the proxy can forward raw request bodies.
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  const cfg = app.get(ConfigService);

  // Register proxy routes directly on the Express instance so they catch all
  // methods and paths — NestJS MiddlewareConsumer.forRoutes('*') only applies
  // to paths registered in controllers and misses unregistered proxy targets.
  const proxyRoutes: Array<{ prefix: string; envKey: string; defaultPort: number }> = [
    { prefix: '/auth',           envKey: 'AUTH_SERVICE_URL',     defaultPort: 3001 },
    { prefix: '/users',          envKey: 'USER_SERVICE_URL',      defaultPort: 3002 },
    { prefix: '/internal/users', envKey: 'USER_SERVICE_URL',      defaultPort: 3002 },
    { prefix: '/matches',        envKey: 'CHAT_SERVICE_URL',      defaultPort: 3003 },
    { prefix: '/discovery',      envKey: 'MATCHING_SERVICE_URL',  defaultPort: 3005 },
  ];

  for (const { prefix, envKey, defaultPort } of proxyRoutes) {
    const target = cfg.get<string>(envKey, `http://localhost:${defaultPort}`);
    // Use pathFilter (not app.use(prefix, ...)) so Express does NOT strip the
    // prefix before forwarding — the downstream service receives the full path.
    app.use(
      createProxyMiddleware({ target, changeOrigin: true, pathFilter: prefix }),
    );
  }

  const config = new DocumentBuilder()
    .setTitle('Ghostless API Gateway')
    .setDescription('Routes traffic to microservices. See GET /docs/services for per-service Swagger.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  const port = cfg.get<number>('API_GATEWAY_PORT', 3000);
  await app.listen(port);
  console.log(`api-gateway listening on :${port}`);
}

bootstrap();
