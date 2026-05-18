/**
 * @file Root Nest module for the API gateway — wires proxy middleware and gateway routes.
 * @module @ghostless/api-gateway
 */

import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GatewayController } from './gateway/gateway.controller';
import { ProxyMiddleware } from './proxy/proxy.middleware';

/** Application root; applies {@link ProxyMiddleware} to all routes. */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [GatewayController],
  providers: [ProxyMiddleware],
})
export class AppModule implements NestModule {
  /**
   * Registers reverse-proxy middleware for downstream microservices.
   *
   * @param consumer - Nest middleware consumer
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(ProxyMiddleware).forRoutes('*');
  }
}
