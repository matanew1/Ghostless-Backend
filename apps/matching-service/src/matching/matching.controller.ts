/**
 * @file HTTP routes for discovery feed, expressing interest, and listing matches.
 * @module @ghostless/matching-service
 */

import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, JwtPayload } from '@ghostless/common';
import { MatchingService } from './matching.service';
import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** Body for `POST /matches/interest`. */
class InterestDto {
  @ApiProperty()
  @IsString()
  toUserId!: string;
}

/** JWT-protected matching API. */
@ApiTags('matching')
@ApiBearerAuth()
@Controller()
export class MatchingController {
  constructor(private readonly matching: MatchingService) {}

  /**
   * Returns ranked discovery candidates for the caller.
   *
   * @param user - JWT payload
   * @param limit - Optional max results (default 20)
   */
  @Get('discovery')
  @UseGuards(JwtAuthGuard)
  discovery(@CurrentUser() user: JwtPayload, @Query('limit') limit?: string) {
    return this.matching.discovery(user.sub, limit ? parseInt(limit, 10) : 20);
  }

  /**
   * Records interest toward another user; creates match when mutual.
   *
   * @param user - JWT payload
   * @param dto - Target user id
   */
  @Post('matches/interest')
  @UseGuards(JwtAuthGuard)
  interest(@CurrentUser() user: JwtPayload, @Body() dto: InterestDto) {
    return this.matching.expressInterest(user.sub, dto.toUserId);
  }

  /** Lists all matches involving the caller. */
  @Get('matches')
  @UseGuards(JwtAuthGuard)
  list(@CurrentUser() user: JwtPayload) {
    return this.matching.listMatches(user.sub);
  }

  /**
   * Alternate path-style interest endpoint (`POST /matches/:toUserId/interest`).
   *
   * @param user - JWT payload
   * @param toUserId - Target user id from path
   */
  @Post('matches/:toUserId/interest')
  @UseGuards(JwtAuthGuard)
  interestByPath(@CurrentUser() user: JwtPayload, @Param('toUserId') toUserId: string) {
    return this.matching.expressInterest(user.sub, toUserId);
  }
}
