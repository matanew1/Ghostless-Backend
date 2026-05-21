/**
 * @file Request DTOs and enums for OAuth login and token refresh.
 * @module @ghostless/auth-service
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';

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

/** Body for `POST /auth/register`. */
export class EmailRegisterDto {
  @ApiProperty({ description: 'User email address' })
  @IsEmail()
  email!: string;

  @ApiProperty({ description: 'Password (min 8 characters)' })
  @IsString()
  @MinLength(8)
  password!: string;
}

/** Body for `POST /auth/login`. */
export class EmailLoginDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  password!: string;
}
