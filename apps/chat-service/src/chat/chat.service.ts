/**
 * @file Match messaging, interaction counters, Kafka events, and Redis pub/sub.
 * @module @ghostless/chat-service
 */

import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@ghostless/database';
import {
  KafkaTopics,
  MessageReadEvent,
  MessageSentEvent,
} from '@ghostless/contracts';
import { EVENT_BUS, IEventBus } from '@ghostless/kafka';
import Redis from 'ioredis';

/**
 * Core chat logic: authorization, persistence, interaction stats, and realtime fan-out.
 */
@Injectable()
export class ChatService {
  private readonly redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {
    this.redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  }

  /**
   * Ensures the user is a participant in the match.
   *
   * @param matchId - Match id
   * @param userId - Caller user id
   * @throws NotFoundException when match missing
   * @throws ForbiddenException when user is not a participant
   */
  async assertMatchParticipant(matchId: string, userId: string) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match) throw new NotFoundException('Match not found');
    if (match.userAId !== userId && match.userBId !== userId) {
      throw new ForbiddenException('Not a participant');
    }
    return match;
  }

  /**
   * Creates a message, bumps interaction stats, publishes Kafka and Redis events.
   *
   * @param matchId - Match id
   * @param senderId - Sender user id
   * @param content - Message text
   */
  async sendMessage(matchId: string, senderId: string, content: string) {
    await this.assertMatchParticipant(matchId, senderId);
    const message = await this.prisma.message.create({
      data: { matchId, senderId, content },
    });

    const match = await this.prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    await this.prisma.interaction.upsert({
      where: { matchId },
      create: {
        matchId,
        userAId: match.userAId,
        userBId: match.userBId,
        messageCount: 1,
        lastInteractionAt: new Date(),
      },
      update: {
        messageCount: { increment: 1 },
        lastInteractionAt: new Date(),
      },
    });

    const event: MessageSentEvent = {
      messageId: message.id,
      matchId,
      senderId,
      sentAt: message.createdAt.toISOString(),
      length: content.length,
    };
    await this.eventBus.publish(KafkaTopics.MESSAGE_SENT, senderId, event);
    await this.redis.publish(`match:${matchId}`, JSON.stringify({ type: 'message', message }));

    return message;
  }

  /**
   * Lists messages for a match the user belongs to.
   *
   * @param matchId - Match id
   * @param userId - Caller user id
   * @param limit - Max messages to return
   */
  async getMessages(matchId: string, userId: string, limit = 50) {
    await this.assertMatchParticipant(matchId, userId);
    return this.prisma.message.findMany({
      where: { matchId },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  /**
   * Sets `readAt` on peer messages and notifies via Kafka and Redis.
   *
   * @param matchId - Match id
   * @param readerId - User marking messages read
   */
  async markRead(matchId: string, readerId: string) {
    await this.assertMatchParticipant(matchId, readerId);
    await this.prisma.message.updateMany({
      where: { matchId, senderId: { not: readerId }, readAt: null },
      data: { readAt: new Date() },
    });

    const event: MessageReadEvent = {
      matchId,
      readerId,
      readAt: new Date().toISOString(),
    };
    await this.eventBus.publish(KafkaTopics.MESSAGE_READ, readerId, event);
    await this.redis.publish(`match:${matchId}`, JSON.stringify({ type: 'read', readerId }));

    return { ok: true };
  }

  /** Exposes Redis client for WebSocket gateway subscriptions. */
  getRedis(): Redis {
    return this.redis;
  }
}
