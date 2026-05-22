/**
 * @file Profile CRUD, onboarding, zone lookup, and internal bootstrap.
 * @module @ghostless/user-service
 */

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { StorageClient } from '@supabase/storage-js';
import { PrismaService } from '@ghostless/database';
import { Zone, toDisplayZone } from '@ghostless/contracts';
import { MAX_USER_PHOTOS, OnboardingDto, UpdateProfileDto } from '../dto/profile.dto';

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
    const { avatarData, photos, dateOfBirth, ...rest } = dto;
    const data: Record<string, unknown> = { ...rest };

    if (avatarData) {
      data.avatarUrl = await this.uploadAvatar(userId, avatarData);
    }

    if (photos) {
      if (photos.length > MAX_USER_PHOTOS) {
        throw new BadRequestException(`At most ${MAX_USER_PHOTOS} additional photos are allowed.`);
      }
      data.photos = photos;
    }

    if (dateOfBirth !== undefined) {
      const dob   = new Date(dateOfBirth);
      const today = new Date();
      const age   = today.getFullYear() - dob.getFullYear()
        - (today < new Date(today.getFullYear(), dob.getMonth(), dob.getDate()) ? 1 : 0);
      if (age < 18) throw new BadRequestException('You must be at least 18 years old.');
      data.dateOfBirth = dob;
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
    if (dto.dateOfBirth) {
      const dob   = new Date(dto.dateOfBirth);
      const today = new Date();
      const age   = today.getFullYear() - dob.getFullYear()
        - (today < new Date(today.getFullYear(), dob.getMonth(), dob.getDate()) ? 1 : 0);
      if (age < 18) throw new BadRequestException('You must be at least 18 years old.');
    }

    await this.prisma.user.upsert({ where: { id: userId }, create: { id: userId }, update: {} });
    await this.prisma.userMetrics.upsert({ where: { userId }, create: { userId }, update: {} });

    const dob = dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined;

    return this.prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        displayName: dto.displayName,
        bio: dto.bio,
        dateOfBirth: dob,
        pacePreference: dto.pacePreference,
        gender: dto.gender,
        seekingGenders: dto.seekingGenders,
        tags: dto.tags ?? [],
        onboardingComplete: dto.onboardingComplete ?? true,
      },
      update: {
        displayName: dto.displayName,
        bio: dto.bio,
        ...(dob !== undefined && { dateOfBirth: dob }),
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
        photos: true,
        tags: true,
        pacePreference: true,
        gender: true,
        dateOfBirth: true,
      },
    });
    if (!profile) throw new NotFoundException('Profile not found');

    const metrics = await this.prisma.userMetrics.findUnique({
      where: { userId },
      select: { zone: true },
    });

    // Expose computed age, not the raw birth date, for privacy.
    const age = profile.dateOfBirth
      ? (() => {
          const dob   = profile.dateOfBirth;
          const today = new Date();
          return today.getFullYear() - dob.getFullYear()
            - (today < new Date(today.getFullYear(), dob.getMonth(), dob.getDate()) ? 1 : 0);
        })()
      : null;

    const { dateOfBirth: _dob, ...rest } = profile;
    return { ...rest, age, zone: metrics?.zone ?? null };
  }

  /**
   * Appends a new photo to the caller's gallery. Avatar is unaffected.
   * Enforces the `MAX_USER_PHOTOS` cap.
   *
   * @param userId - Authenticated user id
   * @param dataUri - Base64 data URI of the photo
   */
  async addPhoto(userId: string, dataUri: string) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { photos: true },
    });
    if (!profile) throw new NotFoundException('Profile not found');
    if (profile.photos.length >= MAX_USER_PHOTOS) {
      throw new BadRequestException(`Photo limit reached (${MAX_USER_PHOTOS}). Remove one first.`);
    }
    const url = await this.uploadPhoto(userId, dataUri);
    return this.prisma.userProfile.update({
      where: { userId },
      data: { photos: [...profile.photos, url] },
    });
  }

  /**
   * Removes the photo at `index` from the caller's gallery. No-op storage
   * delete (Supabase public URLs become inaccessible only via DB linkage).
   *
   * @param userId - Authenticated user id
   * @param index - Zero-based position in the photos array
   */
  async removePhoto(userId: string, index: number) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { photos: true },
    });
    if (!profile) throw new NotFoundException('Profile not found');
    if (!Number.isInteger(index) || index < 0 || index >= profile.photos.length) {
      throw new BadRequestException('Photo index out of range');
    }
    const next = profile.photos.filter((_, i) => i !== index);
    return this.prisma.userProfile.update({
      where: { userId },
      data: { photos: next },
    });
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

  /**
   * Uploads a single gallery photo (separate path so it doesn't collide
   * with the avatar) and returns its public URL. Filename is randomized so
   * multiple uploads can coexist.
   */
  private async uploadPhoto(userId: string, dataUri: string): Promise<string> {
    const base64 = dataUri.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');
    const path   = `photos/${userId}/${randomUUID()}.jpg`;

    const { error } = await this.storage
      .from('avatars')
      .upload(path, buffer, { contentType: 'image/jpeg', upsert: false });

    if (error) throw new Error(`Photo upload failed: ${error.message}`);

    const { data } = this.storage.from('avatars').getPublicUrl(path);
    return data.publicUrl;
  }
}
