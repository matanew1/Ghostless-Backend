/**
 * @file Profile CRUD, onboarding, zone lookup, and internal bootstrap.
 * @module @ghostless/user-service
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@ghostless/database';
import { Zone, toDisplayZone } from '@ghostless/contracts';
import { OnboardingDto, UpdateProfileDto } from '../dto/profile.dto';

/** Persists and reads user profiles and zone display data. */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Loads profile by user id.
   *
   * @param userId - Authenticated user id
   */
  async getProfile(userId: string) {
    const profile = await this.prisma.userProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Profile not found');
    return profile;
  }

  /**
   * Applies partial profile updates.
   *
   * @param userId - Authenticated user id
   * @param dto - Fields to update
   */
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    return this.prisma.userProfile.update({
      where: { userId },
      data: dto,
    });
  }

  /**
   * Upserts onboarding fields and marks completion.
   *
   * @param userId - Authenticated user id
   * @param dto - Onboarding payload
   */
  async completeOnboarding(userId: string, dto: OnboardingDto) {
    return this.prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        displayName: dto.displayName,
        pacePreference: dto.pacePreference,
        tags: dto.tags ?? [],
        onboardingComplete: dto.onboardingComplete ?? true,
      },
      update: {
        displayName: dto.displayName,
        pacePreference: dto.pacePreference,
        tags: dto.tags ?? [],
        onboardingComplete: dto.onboardingComplete ?? true,
      },
    });
  }

  /**
   * Returns the user's zone as a client-facing display label.
   *
   * @param userId - Authenticated user id
   */
  async getZone(userId: string) {
    const metrics = await this.prisma.userMetrics.findUnique({ where: { userId } });
    if (!metrics) throw new NotFoundException('Metrics not found');
    const zone = metrics.zone as unknown as Zone;
    return { zone: toDisplayZone(zone) };
  }

  /**
   * Ensures profile and metrics rows exist (idempotent).
   *
   * @param userId - User to bootstrap
   */
  async bootstrap(userId: string) {
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
    return { ok: true };
  }
}
