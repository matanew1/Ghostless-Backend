/**
 * @file Profile CRUD, onboarding, zone lookup, and internal bootstrap.
 * @module @ghostless/user-service
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageClient } from '@supabase/storage-js';
import { PrismaService } from '@ghostless/database';
import { Zone, toDisplayZone } from '@ghostless/contracts';
import { OnboardingDto, UpdateProfileDto } from '../dto/profile.dto';

/** Persists and reads user profiles and zone display data. */
@Injectable()
export class UsersService {
  private readonly storage: StorageClient;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const url = this.config.get<string>('SUPABASE_URL', '');
    const key = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY', '');
    this.storage = new StorageClient(`${url}/storage/v1`, {
      apikey: key,
      Authorization: `Bearer ${key}`,
    });
  }

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
   * Applies partial profile updates. If avatarData is provided it is uploaded
   * to Supabase Storage and only the resulting public URL is stored in the DB.
   *
   * @param userId - Authenticated user id
   * @param dto - Fields to update
   */
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const { avatarData, ...rest } = dto;
    const data: Record<string, unknown> = { ...rest };

    if (avatarData) {
      data.avatarUrl = await this.uploadAvatar(userId, avatarData);
    }

    return this.prisma.userProfile.update({
      where: { userId },
      data,
    });
  }

  /**
   * Upserts onboarding fields and marks completion.
   * Bootstraps the User + UserMetrics rows first so FK constraints are always satisfied,
   * even if the user was authenticated with a token from a previous DB instance.
   *
   * @param userId - Authenticated user id
   * @param dto - Onboarding payload
   */
  async completeOnboarding(userId: string, dto: OnboardingDto) {
    await this.prisma.user.upsert({ where: { id: userId }, create: { id: userId }, update: {} });
    await this.prisma.userMetrics.upsert({ where: { userId }, create: { userId }, update: {} });

    return this.prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        displayName: dto.displayName,
        bio: dto.bio,
        pacePreference: dto.pacePreference,
        gender: dto.gender,
        seekingGenders: dto.seekingGenders,
        tags: dto.tags ?? [],
        onboardingComplete: dto.onboardingComplete ?? true,
      },
      update: {
        displayName: dto.displayName,
        bio: dto.bio,
        pacePreference: dto.pacePreference,
        gender: dto.gender,
        seekingGenders: dto.seekingGenders,
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
   * Returns the public-facing profile for any user (read-only, safe for display).
   *
   * @param userId - Target user id
   */
  async getPublicProfile(userId: string) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: {
        displayName: true,
        bio: true,
        avatarUrl: true,
        tags: true,
        pacePreference: true,
        gender: true,
      },
    });
    if (!profile) throw new NotFoundException('Profile not found');

    const metrics = await this.prisma.userMetrics.findUnique({
      where: { userId },
      select: { zone: true },
    });

    return { ...profile, zone: metrics?.zone ?? null };
  }

  /**
   * Returns the public avatar URL for a user, or null if unset.
   *
   * @param userId - Target user id
   */
  async getAvatarUrl(userId: string): Promise<string | null> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { avatarUrl: true },
    });
    return profile?.avatarUrl ?? null;
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

  /**
   * Decodes a base64 data URI and uploads it to the Supabase Storage
   * `avatars` bucket, returning the public URL.
   */
  private async uploadAvatar(userId: string, dataUri: string): Promise<string> {
    const base64 = dataUri.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');

    const { error } = await this.storage
      .from('avatars')
      .upload(`${userId}.jpg`, buffer, { contentType: 'image/jpeg', upsert: true });

    if (error) throw new Error(`Avatar upload failed: ${error.message}`);

    const { data } = this.storage
      .from('avatars')
      .getPublicUrl(`${userId}.jpg`);

    return data.publicUrl;
  }
}
