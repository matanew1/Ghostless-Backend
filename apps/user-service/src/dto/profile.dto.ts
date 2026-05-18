/**
 * @file Validation DTOs for profile updates and onboarding.
 * @module @ghostless/user-service
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { PacePreference } from '@ghostless/database';

/** Partial profile update from `PATCH /users/me`. */
export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ enum: PacePreference })
  @IsOptional()
  @IsEnum(PacePreference)
  pacePreference?: PacePreference;
}

/** Initial onboarding payload from `POST /users/onboarding`. */
export class OnboardingDto {
  @ApiProperty()
  @IsString()
  displayName!: string;

  @ApiProperty({ enum: PacePreference })
  @IsEnum(PacePreference)
  pacePreference!: PacePreference;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  onboardingComplete?: boolean;
}
