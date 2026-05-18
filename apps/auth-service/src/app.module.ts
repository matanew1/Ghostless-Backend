/**
 * @file Root Nest module for the auth service.
 * @module @ghostless/auth-service
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@ghostless/database';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health.controller';

/** Wires database, auth domain module, and health checks. */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
