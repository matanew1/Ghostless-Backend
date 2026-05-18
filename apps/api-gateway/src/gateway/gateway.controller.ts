/**
 * @file Gateway-owned HTTP routes (health, service discovery docs index).
 * @module @ghostless/api-gateway
 */

import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

/** Local endpoints served by the gateway (not proxied). */
@ApiTags('gateway')
@Controller()
export class GatewayController {
  constructor(private readonly config: ConfigService) {}

  /** Liveness probe for the gateway process. */
  @Get('health')
  health() {
    return { status: 'ok', service: 'api-gateway' };
  }

  /**
   * Returns Swagger UI URLs for each microservice.
   *
   * @returns Map of service name to local docs URL
   */
  @Get('docs/services')
  @ApiOperation({ summary: 'Swagger URLs for all microservices' })
  swaggerIndex() {
    const base = 'http://localhost';
    return {
      gateway: `${base}:${this.config.get('API_GATEWAY_PORT', 3000)}/docs`,
      auth: `${base}:${this.config.get('AUTH_SERVICE_PORT', 3001)}/docs`,
      user: `${base}:${this.config.get('USER_SERVICE_PORT', 3002)}/docs`,
      chat: `${base}:${this.config.get('CHAT_SERVICE_PORT', 3003)}/docs`,
      scoring: `${base}:${this.config.get('SCORING_SERVICE_PORT', 3004)}/docs`,
      matching: `${base}:${this.config.get('MATCHING_SERVICE_PORT', 3005)}/docs`,
    };
  }
}
