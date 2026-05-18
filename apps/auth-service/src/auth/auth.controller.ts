/**
 * @file HTTP routes for OAuth login, token refresh, and logout.
 * @module @ghostless/auth-service
 */

import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { OAuthLoginDto, RefreshTokenDto } from '../dto/oauth.dto';

/** Public auth API mounted at `/auth`. */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Exchanges a provider ID token for access and refresh tokens.
   *
   * @param dto - Provider and ID token payload
   */
  @Post('oauth')
  @ApiOperation({ summary: 'OAuth login with Google ID token' })
  async oauth(@Body() dto: OAuthLoginDto) {
    return this.authService.loginWithOAuth(dto.provider, dto.idToken);
  }

  /**
   * Rotates a refresh token into a new access/refresh pair.
   *
   * @param dto - Current refresh token
   */
  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  /**
   * Revokes the given refresh token.
   *
   * @param dto - Refresh token to invalidate
   */
  @Post('logout')
  @ApiOperation({ summary: 'Revoke refresh token' })
  async logout(@Body() dto: RefreshTokenDto) {
    await this.authService.logout(dto.refreshToken);
    return { ok: true };
  }
}
