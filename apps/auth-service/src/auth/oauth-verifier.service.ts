/**
 * @file Validates Google ID tokens into normalized user claims.
 * @module @ghostless/auth-service
 */

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { OAuthProviderDto } from '../dto/oauth.dto';

/** Normalized identity extracted from a verified OAuth ID token. */
export interface VerifiedOAuthUser {
  email?: string;
  googleId: string;
}

/**
 * Verifies Google ID tokens.
 */
@Injectable()
export class OAuthVerifierService {
  private readonly googleClient: OAuth2Client;

  constructor(private readonly config: ConfigService) {
    this.googleClient = new OAuth2Client(config.get<string>('GOOGLE_CLIENT_ID'));
  }

  /**
   * Verifies the configured Google OAuth provider.
   *
   * @param provider - Google
   * @param idToken - Raw ID token string
   */
  async verify(provider: OAuthProviderDto, idToken: string): Promise<VerifiedOAuthUser> {
    if (provider !== OAuthProviderDto.GOOGLE) {
      throw new UnauthorizedException('Unsupported OAuth provider');
    }
    return this.verifyGoogle(idToken);
  }

  /** Uses google-auth-library to validate audience and signature. */
  private async verifyGoogle(idToken: string): Promise<VerifiedOAuthUser> {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId) {
      throw new UnauthorizedException('Google OAuth not configured');
    }
    // Accept tokens issued for any platform client (web, iOS, Android).
    const audience = [
      clientId,
      this.config.get<string>('GOOGLE_IOS_CLIENT_ID'),
      this.config.get<string>('GOOGLE_ANDROID_CLIENT_ID'),
      this.config.get<string>('GOOGLE_WEB_CLIENT_ID'),
    ].filter(Boolean) as string[];
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience,
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
}
