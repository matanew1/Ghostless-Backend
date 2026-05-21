/**
 * @file JWT-protected routes for the authenticated user's profile and zone.
 * @module @ghostless/user-service
 */

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, JwtPayload } from '@ghostless/common';
import { UsersService } from './users.service';
import { AddPhotoDto, OnboardingDto, UpdateProfileDto } from '../dto/profile.dto';

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

  /** Returns the public read-only profile for any user by id. */
  @Get(':userId/profile')
  @UseGuards(JwtAuthGuard)
  getPublicProfile(@Param('userId') userId: string) {
    return this.usersService.getPublicProfile(userId);
  }

  /** Returns the public avatar URL for any user by id. */
  @Get(':userId/avatar')
  @UseGuards(JwtAuthGuard)
  async getAvatar(@Param('userId') userId: string) {
    const avatarUrl = await this.usersService.getAvatarUrl(userId);
    if (avatarUrl === null) throw new NotFoundException('No avatar set');
    return { avatarUrl };
  }

  /** Uploads one additional gallery photo for the caller. */
  @Post('me/photos')
  @UseGuards(JwtAuthGuard)
  addPhoto(@CurrentUser() user: JwtPayload, @Body() dto: AddPhotoDto) {
    return this.usersService.addPhoto(user.sub, dto.photoData);
  }

  /** Removes the gallery photo at the given zero-based index. */
  @Delete('me/photos/:index')
  @UseGuards(JwtAuthGuard)
  removePhoto(
    @CurrentUser() user: JwtPayload,
    @Param('index', ParseIntPipe) index: number,
  ) {
    return this.usersService.removePhoto(user.sub, index);
  }
}
