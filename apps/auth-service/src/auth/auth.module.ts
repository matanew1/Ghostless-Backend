/**
 * @file Nest module registering auth controllers, JWT, and OAuth verification.
 * @module @ghostless/auth-service
 */

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OAuthVerifierService } from './oauth-verifier.service';

/** Auth domain — exports {@link AuthService} and configured {@link JwtModule}. */
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, OAuthVerifierService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
