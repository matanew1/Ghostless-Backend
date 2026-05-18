/**
 * @file Discovery scoring, mutual interest, match creation, and zone cache.
 * @module @ghostless/matching-service
 */

import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@ghostless/database';
import { KafkaTopics, MatchCreatedEvent, Zone } from '@ghostless/contracts';
import { EVENT_BUS, IEventBus } from '@ghostless/kafka';
import { ZoneCompatibilityMatrix } from '../zone/zone-compatibility.matrix';

/** Minimum zone alignment score to include a candidate when the list is full. */
const MIN_ALIGNMENT = 0.3;

/**
 * Ranks onboarding-complete users for discovery and manages match lifecycle.
 */
@Injectable()
export class MatchingService {
  private readonly zoneCache = new Map<string, Zone>();
  private readonly matrix = new ZoneCompatibilityMatrix();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  /** Drops cached zone for a user (e.g. after zone-changed event). */
  invalidateZoneCache(userId: string): void {
    this.zoneCache.delete(userId);
  }

  /** Updates in-memory zone cache without a DB round-trip. */
  setZoneCache(userId: string, zone: Zone): void {
    this.zoneCache.set(userId, zone);
  }

  /** Resolves zone from cache or `userMetrics`, defaulting to UNMAPPED. */
  private async getZone(userId: string): Promise<Zone> {
    const cached = this.zoneCache.get(userId);
    if (cached) return cached;
    const metrics = await this.prisma.userMetrics.findUnique({ where: { userId } });
    const zone = (metrics?.zone as Zone) ?? Zone.UNMAPPED;
    this.zoneCache.set(userId, zone);
    return zone;
  }

  /**
   * Scores candidates by tag overlap, zone alignment, RTS similarity, and ghost index.
   *
   * @param userId - Caller user id
   * @param limit - Max candidates to return
   */
  async discovery(userId: string, limit = 20) {
    const me = await this.prisma.userProfile.findUnique({ where: { userId } });
    const myMetrics = await this.prisma.userMetrics.findUnique({ where: { userId } });
    const myZone = (myMetrics?.zone as Zone) ?? Zone.UNMAPPED;
    const myTags = new Set(me?.tags ?? []);

    const candidates = await this.prisma.userProfile.findMany({
      where: {
        userId: { not: userId },
        onboardingComplete: true,
      },
      take: 100,
    });

    const existingMatches = await this.prisma.match.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
    });
    const excluded = new Set(
      existingMatches.flatMap((m) => [m.userAId, m.userBId]),
    );
    excluded.add(userId);

    const scored: Array<{ userId: string; score: number; zone: Zone }> = [];

    for (const c of candidates) {
      if (excluded.has(c.userId)) continue;
      const theirMetrics = await this.prisma.userMetrics.findUnique({
        where: { userId: c.userId },
      });
      const theirZone = (theirMetrics?.zone as Zone) ?? Zone.UNMAPPED;
      const alignment = this.matrix.getScore(myZone, theirZone);
      // Skip low-alignment candidates only when we already have enough results
      if (alignment < MIN_ALIGNMENT && scored.length >= limit) continue;

      const interestSim = this.jaccard(myTags, new Set(c.tags));
      const velocityMatch =
        1 -
        Math.abs((myMetrics?.rts ?? 0.5) - (theirMetrics?.rts ?? 0.5));
      const ghostPenalty = Math.max(myMetrics?.gi ?? 0, theirMetrics?.gi ?? 0);

      const score =
        interestSim + alignment + velocityMatch - ghostPenalty;

      scored.push({ userId: c.userId, score, zone: theirZone });
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ userId: id, score, zone }) => ({
        userId: id,
        score,
        zone,
      }));
  }

  /**
   * Records one-way interest; creates a match when the reverse interest exists.
   *
   * @param fromUserId - Caller user id
   * @param toUserId - Target user id
   */
  async expressInterest(fromUserId: string, toUserId: string) {
    await this.prisma.matchInterest.upsert({
      where: { fromUserId_toUserId: { fromUserId, toUserId } },
      create: { fromUserId, toUserId, interested: true },
      update: { interested: true },
    });

    const mutual = await this.prisma.matchInterest.findUnique({
      where: {
        fromUserId_toUserId: { fromUserId: toUserId, toUserId: fromUserId },
      },
    });

    if (mutual?.interested) {
      return this.createMatch(fromUserId, toUserId);
    }
    return { status: 'pending' };
  }

  /**
   * Upserts a canonical match row (sorted user ids) and publishes {@link MatchCreatedEvent}.
   *
   * @param userAId - First participant (order normalized)
   * @param userBId - Second participant
   */
  async createMatch(userAId: string, userBId: string) {
    const [a, b] = userAId < userBId ? [userAId, userBId] : [userBId, userAId];
    const metricsA = await this.prisma.userMetrics.findUnique({ where: { userId: a } });
    const metricsB = await this.prisma.userMetrics.findUnique({ where: { userId: b } });
    const alignment = this.matrix.getScore(
      (metricsA?.zone as Zone) ?? Zone.UNMAPPED,
      (metricsB?.zone as Zone) ?? Zone.UNMAPPED,
    );
    const score =
      alignment +
      (1 - Math.abs((metricsA?.rts ?? 0.5) - (metricsB?.rts ?? 0.5))) -
      Math.max(metricsA?.gi ?? 0, metricsB?.gi ?? 0);

    const match = await this.prisma.match.upsert({
      where: { userAId_userBId: { userAId: a, userBId: b } },
      create: { userAId: a, userBId: b, score, status: 'ACTIVE' },
      update: { score, status: 'ACTIVE' },
    });

    const event: MatchCreatedEvent = {
      matchId: match.id,
      userAId: a,
      userBId: b,
    };
    await this.eventBus.publish(KafkaTopics.MATCH_CREATED, match.id, event);

    return match;
  }

  /** Returns matches where the user is userA or userB. */
  async listMatches(userId: string) {
    return this.prisma.match.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Jaccard similarity of two tag sets; 0.5 when both empty. */
  private jaccard(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 0.5;
    const intersection = [...a].filter((x) => b.has(x)).length;
    const union = new Set([...a, ...b]).size;
    return union > 0 ? intersection / union : 0;
  }
}
