/**
 * @file HTTP routes for discovery feed, expressing interest, and listing matches.
 * @module @ghostless/matching-service
 */

import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, JwtPayload } from '@ghostless/common';
import { MatchingService } from './matching.service';

/** JWT-protected matching API — all routes under `/discovery` so the gateway proxy is unambiguous. */
@ApiTags('matching')
@ApiBearerAuth()
@Controller('discovery')
export class MatchingController {
  constructor(private readonly matching: MatchingService) {}

  /**
   * Returns ranked discovery candidates for the caller.
   *
   * @param user - JWT payload
   * @param limit - Optional max results (default 20)
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  discovery(@CurrentUser() user: JwtPayload, @Query('limit') limit?: string) {
    return this.matching.discovery(user.sub, limit ? parseInt(limit, 10) : 20);
  }

  /**
   * Records interest toward another user via path param; creates match when mutual.
   *
   * @param user - JWT payload
   * @param toUserId - Target user id from path
   */
  @Post(':toUserId/interest')
  @UseGuards(JwtAuthGuard)
  interest(@CurrentUser() user: JwtPayload, @Param('toUserId') toUserId: string) {
    return this.matching.expressInterest(user.sub, toUserId);
  }

  /** Lists all matches involving the caller. */
  @Get('matches')
  @UseGuards(JwtAuthGuard)
  list(@CurrentUser() user: JwtPayload) {
    return this.matching.listMatches(user.sub);
  }
}
