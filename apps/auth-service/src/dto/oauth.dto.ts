/**
 * @file Request DTOs and enums for OAuth login and token refresh.
 * @module @ghostless/auth-service
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString } from 'class-validator';

/** Supported OAuth identity providers. */
export enum OAuthProviderDto {
  GOOGLE = 'GOOGLE',
}

/** Body for `POST /auth/oauth`. */
export class OAuthLoginDto {
  @ApiProperty({ enum: OAuthProviderDto })
  @IsEnum(OAuthProviderDto)
  provider!: OAuthProviderDto;

  @ApiProperty({ description: 'ID token from Google' })
  @IsString()
  idToken!: string;
}

/** Body for refresh and logout endpoints. */
export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken!: string;
}
