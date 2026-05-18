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

/**
 * Aggregates message and match data into RTS/EDS/GI/reciprocity scores and zones.
 */
@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);
  private readonly pendingStats = new Map<
    string,
    { responseTimes: number[]; lengths: number[]; questions: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly calculator: MetricsCalculator,
    private readonly classifier: ZoneClassifier,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  /**
   * Increments message count and buffers lightweight stats for batch recalc.
   *
   * @param event - Message sent domain event
   */
  async onMessageSent(event: MessageSentEvent): Promise<void> {
    await this.prisma.userMetrics.update({
      where: { userId: event.senderId },
      data: { totalMessages: { increment: 1 } },
    });

    const stats = this.pendingStats.get(event.senderId) ?? {
      responseTimes: [],
      lengths: [],
      questions: 0,
    };
    stats.lengths.push(event.length);
    if (event.length > 0) {
      const lastChar = event.length; // question detection done on content in full impl
      void lastChar;
    }
    this.pendingStats.set(event.senderId, stats);
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
   *
   * @param userId - User to recalculate
   */
  async recalculateUser(userId: string): Promise<void> {
    const metrics = await this.prisma.userMetrics.findUnique({ where: { userId } });
    if (!metrics) return;

    const messages = await this.prisma.message.findMany({
      where: { senderId: userId },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });

    const responseTimes: number[] = [];
    const lengths = messages.map((m) => m.content.length);
    const questionCount = messages.filter((m) => m.content.includes('?')).length;

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
      messages.length || 1,
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
    const finalZone = await this.applySoftTransition(
      userId,
      currentZone,
      proposed,
      metrics.pendingZone as unknown as Zone | null,
      metrics.pendingZoneRuns,
    );

    await this.prisma.userMetrics.update({
      where: { userId },
      data: {
        rts,
        eds,
        gi,
        reciprocity,
        compositeScore,
        zone: finalZone as PrismaZone,
        pendingZone: finalZone !== proposed ? (proposed as PrismaZone) : null,
        pendingZoneRuns:
          finalZone !== proposed ? metrics.pendingZoneRuns + 1 : 0,
      },
    });

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
  private async applySoftTransition(
    userId: string,
    current: Zone,
    proposed: Zone,
    pending: Zone | null,
    pendingRuns: number,
  ): Promise<Zone> {
    if (proposed === current) {
      return current;
    }
    if (pending === proposed && pendingRuns + 1 >= SOFT_TRANSITION_RUNS) {
      return proposed;
    }
    if (pending !== proposed) {
      await this.prisma.userMetrics.update({
        where: { userId },
        data: { pendingZone: proposed as PrismaZone, pendingZoneRuns: 1 },
      });
      return current;
    }
    return current;
  }

  /** Recalculates all users with metrics updated in the last 7 days. */
  async recalculateAll(): Promise<void> {
    const active = await this.prisma.userMetrics.findMany({
      where: { updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    });
    for (const m of active) {
      await this.recalculateUser(m.userId);
    }
  }
}
