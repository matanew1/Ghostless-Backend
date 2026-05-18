/**
 * @file Health check endpoint for the matching service.
 * @module @ghostless/matching-service
 */

import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

/** Liveness probe for load balancers and orchestration. */
@ApiTags('health')
@Controller('health')
export class HealthController {
  /** Returns service identity and ok status. */
  @Get()
  check() {
    return { status: 'ok', service: 'matching-service' };
  }
}
