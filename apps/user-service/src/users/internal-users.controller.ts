/**
 * @file Internal service-to-service routes for user bootstrap (no JWT).
 * @module @ghostless/user-service
 */

import { Controller, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';

/** Internal API for other services to ensure profile/metrics exist. */
@ApiTags('internal')
@Controller('internal/users')
export class InternalUsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Creates empty profile and metrics rows if missing.
   *
   * @param userId - Target user id
   */
  @Post(':userId/bootstrap')
  bootstrap(@Param('userId') userId: string) {
    return this.usersService.bootstrap(userId);
  }
}
