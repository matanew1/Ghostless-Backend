/**
 * @file JWT-protected routes for the authenticated user's profile and zone.
 * @module @ghostless/user-service
 */

import { Body, Controller, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, JwtPayload } from '@ghostless/common';
import { UsersService } from './users.service';
import { OnboardingDto, UpdateProfileDto } from '../dto/profile.dto';

/** Public user API mounted at `/users`. */
@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /** Returns the caller's profile row. */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: JwtPayload) {
    return this.usersService.getProfile(user.sub);
  }

  /** Partially updates display fields on the caller's profile. */
  @Patch('me')
  @UseGuards(JwtAuthGuard)
  updateMe(@CurrentUser() user: JwtPayload, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.sub, dto);
  }

  /** Completes or updates onboarding fields. */
  @Post('onboarding')
  @UseGuards(JwtAuthGuard)
  onboarding(@CurrentUser() user: JwtPayload, @Body() dto: OnboardingDto) {
    return this.usersService.completeOnboarding(user.sub, dto);
  }

  /** Returns the caller's display zone derived from metrics. */
  @Get('me/zone')
  @UseGuards(JwtAuthGuard)
  getZone(@CurrentUser() user: JwtPayload) {
    return this.usersService.getZone(user.sub);
  }

  /** Returns the public avatar URL for any user by id. */
  @Get(':userId/avatar')
  @UseGuards(JwtAuthGuard)
  async getAvatar(@Param('userId') userId: string) {
    const avatarUrl = await this.usersService.getAvatarUrl(userId);
    if (avatarUrl === null) throw new NotFoundException('No avatar set');
    return { avatarUrl };
  }
}
