/**
 * @file Validation DTOs for profile updates and onboarding.
 * @module @ghostless/user-service
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { Gender, PacePreference } from '@ghostless/database';

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

  @ApiPropertyOptional({ enum: Gender, description: "Caller's own gender." })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ enum: Gender, isArray: true, description: 'Genders the caller wants to match with.' })
  @IsOptional()
  @IsArray()
  @IsEnum(Gender, { each: true })
  seekingGenders?: Gender[];

  @ApiPropertyOptional({ description: 'Base64 data URI of the profile image.' })
  @IsOptional()
  @IsString()
  avatarData?: string;
}

/** Initial onboarding payload from `POST /users/onboarding`. */
export class OnboardingDto {
  @ApiProperty()
  @IsString()
  displayName!: string;

  @ApiProperty({ enum: PacePreference })
  @IsEnum(PacePreference)
  pacePreference!: PacePreference;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiProperty({ enum: Gender, description: "Caller's own gender." })
  @IsEnum(Gender)
  gender!: Gender;

  @ApiProperty({ enum: Gender, isArray: true, description: 'At least one gender the caller wants to match with.' })
  @IsArray()
  @IsEnum(Gender, { each: true })
  @ArrayMinSize(1)
  seekingGenders!: Gender[];

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
