/**
 * @file Discovery scoring, mutual interest, match creation, and zone cache.
 * @module @ghostless/matching-service
 */

import { Inject, Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@ghostless/database';
import { InterestExpressedEvent, KafkaTopics, MatchCreatedEvent, Zone } from '@ghostless/contracts';
import { EVENT_BUS, IEventBus } from '@ghostless/kafka';
import { ZoneCompatibilityMatrix } from '../zone/zone-compatibility.matrix';

/**
 * Minimum zone alignment score to admit a candidate.
 * Adjacent zones (e.g. CHILL↔STEADY=0.8, CHILL↔GHOST_TOWN=0.7) pass.
 * Non-adjacent zones (e.g. CHILL↔SPARK=0.2, GHOST_TOWN↔PULSE=0.1) are cut.
 * This prevents dead-end silos while keeping incompatible extremes apart.
 */
const MIN_ALIGNMENT = 0.5;

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

  /** Resolves zone from cache or `userMetrics`, defaulting to STEADY. */
  private async getZone(userId: string): Promise<Zone> {
    const cached = this.zoneCache.get(userId);
    if (cached) return cached;
    const metrics = await this.prisma.userMetrics.findUnique({ where: { userId } });
    const zone = (metrics?.zone as Zone) ?? Zone.STEADY;
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
    const myZone = (myMetrics?.zone as Zone) ?? Zone.STEADY;
    const myTags = new Set(me?.tags ?? []);

    // Discovery requires the caller to have set both gender and seekingGenders
    // (mutual filter is meaningless otherwise).
    if (!me?.gender || (me.seekingGenders ?? []).length === 0) {
      return [];
    }

    const candidates = await this.prisma.userProfile.findMany({
      where: {
        userId: { not: userId },
        onboardingComplete: true,
        // Strict mutual 1:1 gender preference filter:
        //   1. candidate's gender must be in MY seekingGenders
        //   2. MY gender must be in candidate's seekingGenders
        gender: { in: me.seekingGenders },
        seekingGenders: { has: me.gender },
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

    const scored: Array<{ userId: string; score: number; zone: Zone; displayName: string | null; avatarUrl: string | null }> = [];

    for (const c of candidates) {
      if (excluded.has(c.userId)) continue;
      const theirMetrics = await this.prisma.userMetrics.findUnique({
        where: { userId: c.userId },
      });
      const theirZone = (theirMetrics?.zone as Zone) ?? Zone.STEADY;

      // Soft zone gate: only admit candidates with sufficient zone compatibility.
      // Adjacent zones (CHILL↔STEADY=0.8) pass; polar opposites (GHOST_TOWN↔SPARK=0.0) don't.
      // This replaces the old hard same-zone-only filter which created dead-end silos.
      const alignment = this.matrix.getScore(myZone, theirZone);
      if (alignment < MIN_ALIGNMENT) continue;

      const myGI    = myMetrics?.gi ?? 0;
      const theirGI = theirMetrics?.gi ?? 0;

      // Hard ghost-compatibility gate: protect non-ghosters from serial ghosters.
      // A GI gap > 0.5 means one party is reliable and the other chronically ghosts —
      // pairing them creates a bad experience for both.
      const ghostGap = Math.abs(myGI - theirGI);
      if (ghostGap > 0.5) continue;

      const interestSim   = this.jaccard(myTags, new Set(c.tags));
      const velocityMatch = 1 - Math.abs((myMetrics?.rts ?? 0.5) - (theirMetrics?.rts ?? 0.5));

      // Ghost penalty: absolute GI level hurts the score, asymmetry hurts even more.
      // Two ghosters matching each other get a base penalty but not the asymmetry hit.
      const ghostPenalty  = Math.max(myGI, theirGI) * 0.4 + ghostGap * 1.0;

      // Final composite (higher = better match):
      //   interestSim   (0–1)  — shared tag overlap
      //   alignment     (0–1)  — zone compatibility
      //   velocityMatch (0–1)  — similar response pace
      //   ghostPenalty  (0–1)  — chronic ghosting pulls the score down
      const score = interestSim + alignment + velocityMatch - ghostPenalty;

      scored.push({ userId: c.userId, score, zone: theirZone, displayName: c.displayName ?? null, avatarUrl: c.avatarUrl ?? null });
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ userId: id, score, zone, displayName, avatarUrl }) => ({
        userId: id,
        score,
        zone,
        displayName,
        avatarUrl,
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

    const event: InterestExpressedEvent = {
      fromUserId,
      toUserId,
      expressedAt: new Date().toISOString(),
    };
    await this.eventBus.publish(KafkaTopics.INTEREST_EXPRESSED, fromUserId, event);

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
      (metricsA?.zone as Zone) ?? Zone.STEADY,
      (metricsB?.zone as Zone) ?? Zone.STEADY,
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

  /** Returns matches where the user is userA or userB, enriched with partner profile. */
  async listMatches(userId: string) {
    const matches = await this.prisma.match.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      orderBy: { createdAt: 'desc' },
    });

    const partnerIds = matches.map((m) => (m.userAId === userId ? m.userBId : m.userAId));
    const profiles = await this.prisma.userProfile.findMany({
      where: { userId: { in: partnerIds } },
      select: { userId: true, displayName: true, avatarUrl: true },
    });
    const profileMap = new Map(profiles.map((p) => [p.userId, p]));

    return matches.map((m) => {
      const partnerId = m.userAId === userId ? m.userBId : m.userAId;
      const profile = profileMap.get(partnerId);
      return {
        ...m,
        partnerDisplayName: profile?.displayName ?? null,
        partnerAvatarUrl: profile?.avatarUrl ?? null,
      };
    });
  }

  /**
   * Ends a match by setting its status to ENDED.
   * Throws if the match doesn't exist or the caller is not a participant.
   *
   * @param userId - Caller user id (must be userA or userB)
   * @param matchId - Match to end
   */
  async unmatch(userId: string, matchId: string) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match) throw new NotFoundException('Match not found');
    if (match.userAId !== userId && match.userBId !== userId) {
      throw new ForbiddenException('Not a participant of this match');
    }
    return this.prisma.match.update({
      where: { id: matchId },
      data:  { status: 'ENDED' },
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
