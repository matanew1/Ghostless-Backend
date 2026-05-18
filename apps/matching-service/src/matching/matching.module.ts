/**
 * @file Nest module for discovery, mutual interest, and match listing.
 * @module @ghostless/matching-service
 */

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '@ghostless/common';
import { MatchingController } from './matching.controller';
import { MatchingService } from './matching.service';

/** Matching domain — exports {@link MatchingService} for Kafka consumers. */
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [MatchingController],
  providers: [MatchingService, JwtAuthGuard],
  exports: [MatchingService],
})
export class MatchingModule {}
