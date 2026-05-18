/**
 * @file OAuth login, refresh-token rotation, and JWT issuance.
 * @module @ghostless/auth-service
 */

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '@ghostless/database';
import { OAuthProviderDto } from '../dto/oauth.dto';
import { OAuthVerifierService, VerifiedOAuthUser } from './oauth-verifier.service';

/** Access and refresh tokens returned after successful authentication. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  userId: string;
}

/**
 * Handles user lookup/creation from verified OAuth identities and token lifecycle.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly verifier: OAuthVerifierService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Verifies the ID token, upserts the user, and issues tokens.
   *
   * @param provider - Google or Apple
   * @param idToken - Provider-issued ID token
   */
  async loginWithOAuth(provider: OAuthProviderDto, idToken: string): Promise<TokenPair> {
    const verified = await this.verifier.verify(provider, idToken);
    const user = await this.findOrCreateUser(verified);
    await this.ensureProfileAndMetrics(user.id);
    return this.issueTokens(user.id, user.email ?? undefined);
  }

  /**
   * Validates refresh token, deletes it (one-time use), and issues a new pair.
   *
   * @param refreshToken - Plain refresh token from the client
   */
  async refresh(refreshToken: string): Promise<TokenPair> {
    const hash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash: hash, expiresAt: { gt: new Date() } },
      include: { user: true },
    });
    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    await this.prisma.refreshToken.delete({ where: { id: stored.id } });
    return this.issueTokens(stored.userId, stored.user.email ?? undefined);
  }

  /**
   * Removes all refresh-token rows matching the hashed token.
   *
   * @param refreshToken - Plain refresh token to revoke
   */
  async logout(refreshToken: string): Promise<void> {
    const hash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.deleteMany({ where: { tokenHash: hash } });
  }

  /** Upserts user by Google or Apple subject id from verified claims. */
  private async findOrCreateUser(verified: VerifiedOAuthUser) {
    if (verified.googleId) {
      return this.prisma.user.upsert({
        where: { googleId: verified.googleId },
        create: { email: verified.email, googleId: verified.googleId },
        update: { email: verified.email ?? undefined },
      });
    }
    if (verified.appleId) {
      return this.prisma.user.upsert({
        where: { appleId: verified.appleId },
        create: { email: verified.email, appleId: verified.appleId },
        update: { email: verified.email ?? undefined },
      });
    }
    throw new Error('No OAuth identity');
  }

  /** Ensures profile and metrics rows exist for new users. */
  private async ensureProfileAndMetrics(userId: string): Promise<void> {
    await this.prisma.userProfile.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    await this.prisma.userMetrics.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  /** Signs JWT access token and persists hashed refresh token (7-day TTL). */
  private async issueTokens(userId: string, email?: string): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync({ sub: userId, email });

    const refreshToken = randomBytes(48).toString('hex');
    const expiresDays = 7;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresDays);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt,
      },
    });

    return { accessToken, refreshToken, userId };
  }

  /** SHA-256 hash for storing refresh tokens at rest. */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
