/**
 * @file Nest module for user profile HTTP API and internal bootstrap routes.
 * @module @ghostless/user-service
 */

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '@ghostless/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { InternalUsersController } from './internal-users.controller';

/** User domain — JWT-protected public routes plus internal bootstrap. */
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
  controllers: [UsersController, InternalUsersController],
  providers: [UsersService, JwtAuthGuard],
})
export class UsersModule {}
