/**
 * @file User metrics recalculation, soft zone transitions, and zone-changed events.
 * @module @ghostless/scoring-service
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService, Zone as PrismaZone } from '@ghostless/database';
import {
  KafkaTopics,
  MessageReadEvent,
  MessageSentEvent,
  UserZoneChangedEvent,
  Zone,
} from '@ghostless/contracts';
import { EVENT_BUS, IEventBus } from '@ghostless/kafka';
import { MetricsCalculator } from './metrics-calculator';
import { ZoneClassifier } from '../zone/zone-classifier';

/** Consecutive recalc runs required before applying a pending zone change. */
const SOFT_TRANSITION_RUNS = 2;

/** Outcome of a recalc attempt — used by the queue processor to retry on lost races. */
export type RecalcOutcome = 'updated' | 'stale';

/**
 * Aggregates message and match data into RTS/EDS/GI/reciprocity scores and zones.
 */
@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly calculator: MetricsCalculator,
    private readonly classifier: ZoneClassifier,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  /**
   * Increments the sender's message count. Heavier recalc is queued separately.
   *
   * @param event - Message sent domain event
   */
  async onMessageSent(event: MessageSentEvent): Promise<void> {
    await this.prisma.userMetrics.upsert({
      where: { userId: event.senderId },
      create: { userId: event.senderId, totalMessages: 1 },
      update: { totalMessages: { increment: 1 } },
    });
  }

  /**
   * Placeholder for read-side ghost-index updates (handled in batch recalc).
   *
   * @param _event - Message read domain event
   */
  async onMessageRead(_event: MessageReadEvent): Promise<void> {
    // GI updated on batch recalc
  }

  /**
   * Recomputes metrics and zone for one user from stored messages and matches.
   * Uses optimistic concurrency on `UserMetrics.revision`; returns `'stale'`
   * when another worker won the write race so callers can re-enqueue.
   *
   * @param userId - User to recalculate
   */
  async recalculateUser(userId: string): Promise<RecalcOutcome> {
    const metrics = await this.prisma.userMetrics.findUnique({ where: { userId } });
    if (!metrics) return 'updated';

    const messages = await this.prisma.message.findMany({
      where: { senderId: userId },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });

    const responseTimes: number[] = [];
    const lengths = messages.map((m) => m.content.length);
    const questionCount = messages.filter((m) => m.isQuestion).length;

    for (let i = 1; i < messages.length; i++) {
      const prev = messages[i - 1];
      const curr = messages[i];
      if (prev.senderId !== curr.senderId) {
        responseTimes.push(curr.createdAt.getTime() - prev.createdAt.getTime());
      }
    }

    const matches = await this.prisma.match.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
    });

    let unread = 0;
    const reciprocitySamples: number[] = [];

    for (const match of matches) {
      const unreadCount = await this.prisma.message.count({
        where: {
          matchId: match.id,
          senderId: { not: userId },
          readAt: null,
        },
      });
      if (unreadCount > 0) unread++;

      const sentA = await this.prisma.message.count({
        where: { matchId: match.id, senderId: match.userAId },
      });
      const sentB = await this.prisma.message.count({
        where: { matchId: match.id, senderId: match.userBId },
      });
      const max = Math.max(sentA, sentB, 1);
      const min = Math.min(sentA, sentB);
      reciprocitySamples.push(min / max);
    }

    const hoursSince =
      (Date.now() - metrics.updatedAt.getTime()) / (1000 * 60 * 60);

    const rts = this.calculator.computeRts(responseTimes);
    const eds = this.calculator.computeEds(
      lengths,
      questionCount,
      messages.length,
      Math.min(messages.length, 10),
    );
    const gi = this.calculator.computeGi(
      unread,
      matches.length || 1,
      metrics.gi,
      hoursSince,
    );
    const reciprocity = this.calculator.computeReciprocity(reciprocitySamples);
    const compositeScore = this.calculator.composite(rts, eds, reciprocity, gi);

    const proposed = this.classifier.classify({
      rts,
      eds,
      gi,
      reciprocity,
      totalMessages: metrics.totalMessages,
    });

    const currentZone = metrics.zone as unknown as Zone;
    const pendingZone = metrics.pendingZone as unknown as Zone | null;
    const finalZone = this.applySoftTransition(
      currentZone,
      proposed,
      pendingZone,
      metrics.pendingZoneRuns,
    );

    // pendingZoneRuns: increment when the same zone is accumulating,
    // reset to 1 when a new proposed zone appears, clear on transition.
    const nextPendingZone = (finalZone !== proposed && proposed !== currentZone)
      ? (proposed as PrismaZone)
      : null;
    const nextPendingZoneRuns = nextPendingZone !== null
      ? (pendingZone === proposed ? metrics.pendingZoneRuns + 1 : 1)
      : 0;

    // Optimistic concurrency: write only if revision is unchanged.
    const updated = await this.prisma.userMetrics.updateMany({
      where: { userId, revision: metrics.revision },
      data: {
        rts,
        eds,
        gi,
        reciprocity,
        compositeScore,
        zone: finalZone as PrismaZone,
        pendingZone: nextPendingZone,
        pendingZoneRuns: nextPendingZoneRuns,
        revision: { increment: 1 },
      },
    });

    if (updated.count === 0) {
      this.logger.warn(`Stale recalc for ${userId} (revision ${metrics.revision} lost race)`);
      return 'stale';
    }

    if (finalZone !== currentZone) {
      await this.prisma.zoneHistory.create({
        data: {
          userId,
          previousZone: currentZone as PrismaZone,
          newZone: finalZone as PrismaZone,
        },
      });
      const zoneEvent: UserZoneChangedEvent = {
        userId,
        zone: finalZone,
        previousZone: currentZone,
      };
      await this.eventBus.publish(KafkaTopics.USER_ZONE_CHANGED, userId, zoneEvent);
      this.logger.log(`Zone changed ${userId}: ${currentZone} → ${finalZone}`);
    }

    return 'updated';
  }

  /**
   * Delays zone changes until the proposed zone persists for {@link SOFT_TRANSITION_RUNS} runs.
   *
   * @param userId - User id
   * @param current - Current committed zone
   * @param proposed - Newly computed zone
   * @param pending - Previously pending zone, if any
   * @param pendingRuns - How many runs the pending zone has been seen
   */
  private applySoftTransition(
    current: Zone,
    proposed: Zone,
    pending: Zone | null,
    pendingRuns: number,
  ): Zone {
    if (proposed === current) return current;
    if (pending === proposed && pendingRuns + 1 >= SOFT_TRANSITION_RUNS) return proposed;
    return current; // accumulating — caller writes pendingZone/pendingZoneRuns via updateMany
  }

  /**
   * Streams active users (updated in the last 7 days) and yields their ids.
   * Cron uses this to enqueue recalc jobs without loading everyone into memory.
   */
  async *streamActiveUserIds(batchSize = 500): AsyncIterableIterator<string> {
    let cursor: string | undefined;
    for (;;) {
      const page = await this.prisma.userMetrics.findMany({
        where: { updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
        take: batchSize,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
        select: { id: true, userId: true },
      });
      if (page.length === 0) return;
      for (const m of page) yield m.userId;
      cursor = page[page.length - 1].id;
      if (page.length < batchSize) return;
    }
  }
}
