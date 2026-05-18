/**
 * @file Validates Google and Apple ID tokens into normalized user claims.
 * @module @ghostless/auth-service
 */

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { OAuthProviderDto } from '../dto/oauth.dto';

/** Normalized identity extracted from a verified OAuth ID token. */
export interface VerifiedOAuthUser {
  email?: string;
  googleId?: string;
  appleId?: string;
}

/**
 * Verifies third-party ID tokens; Apple uses lightweight JWT decode when JWKS is not configured.
 */
@Injectable()
export class OAuthVerifierService {
  private readonly googleClient: OAuth2Client;

  constructor(private readonly config: ConfigService) {
    this.googleClient = new OAuth2Client(config.get<string>('GOOGLE_CLIENT_ID'));
  }

  /**
   * Routes verification to the appropriate provider implementation.
   *
   * @param provider - Google or Apple
   * @param idToken - Raw ID token string
   */
  async verify(provider: OAuthProviderDto, idToken: string): Promise<VerifiedOAuthUser> {
    if (provider === OAuthProviderDto.GOOGLE) {
      return this.verifyGoogle(idToken);
    }
    return this.verifyApple(idToken);
  }

  /** Uses google-auth-library to validate audience and signature. */
  private async verifyGoogle(idToken: string): Promise<VerifiedOAuthUser> {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId) {
      throw new UnauthorizedException('Google OAuth not configured');
    }
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: clientId,
      });
      const payload = ticket.getPayload();
      if (!payload?.sub) {
        throw new UnauthorizedException('Invalid Google token');
      }
      return { email: payload.email, googleId: payload.sub };
    } catch {
      throw new UnauthorizedException('Invalid Google token');
    }
  }

  /**
   * MVP Apple verification: decodes JWT payload and checks `aud` / `sub`.
   * Full JWKS validation should replace this in production.
   */
  private async verifyApple(idToken: string): Promise<VerifiedOAuthUser> {
    const appleClientId = this.config.get<string>('APPLE_CLIENT_ID');
    if (!appleClientId) {
      throw new UnauthorizedException('Apple OAuth not configured');
    }
    try {
      const parts = idToken.split('.');
      if (parts.length !== 3) {
        throw new UnauthorizedException('Invalid Apple token');
      }
      const payload = JSON.parse(
        Buffer.from(parts[1], 'base64url').toString('utf8'),
      ) as { sub?: string; email?: string; aud?: string };
      if (payload.aud !== appleClientId || !payload.sub) {
        throw new UnauthorizedException('Invalid Apple token');
      }
      return { email: payload.email, appleId: payload.sub };
    } catch {
      throw new UnauthorizedException('Invalid Apple token');
    }
  }
}
