/**
 * @file Kafka consumers for message and match events driving scoring side effects.
 * @module @ghostless/scoring-service
 */

import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import {
  InterestExpressedEvent,
  KafkaTopics,
  MatchCreatedEvent,
  MessageReadEvent,
  MessageSentEvent,
} from '@ghostless/contracts';
import { EVENT_CONSUMER, IEventConsumer } from '@ghostless/kafka';
import { ScoringService } from '../scoring/scoring.service';
import { PrismaService } from '@ghostless/database';
import { RecalcEnqueuer } from '../recalc-queue/recalc-enqueuer.service';

/**
 * Wires message sent/read handlers, ensures metrics rows exist for new matches,
 * and enqueues per-user recalc jobs on every relevant event.
 */
@Injectable()
export class MessageEventsConsumer implements OnModuleInit {
  constructor(
    @Inject(EVENT_CONSUMER) private readonly consumer: IEventConsumer,
    private readonly scoring: ScoringService,
    private readonly prisma: PrismaService,
    private readonly enqueuer: RecalcEnqueuer,
  ) {}

  /** Subscribes to message and match-created topics on module startup. */
  async onModuleInit(): Promise<void> {
    await this.consumer.subscribe<MessageSentEvent>(
      KafkaTopics.MESSAGE_SENT,
      'scoring-service-messages',
      async (e) => {
        await this.scoring.onMessageSent(e);
        await this.enqueuer.enqueue(e.senderId);
      },
    );

    await this.consumer.subscribe<MessageReadEvent>(
      KafkaTopics.MESSAGE_READ,
      'scoring-service-reads',
      async (e) => {
        await this.scoring.onMessageRead(e);
        // Reader's ghost-index can improve once peer messages are marked read.
        await this.enqueuer.enqueue(e.readerId);
      },
    );

    await this.consumer.subscribe<MatchCreatedEvent>(
      KafkaTopics.MATCH_CREATED,
      'scoring-service-matches',
      async (e) => {
        for (const userId of [e.userAId, e.userBId]) {
          await this.prisma.userMetrics.upsert({
            where: { userId },
            create: { userId },
            update: {},
          });
          await this.enqueuer.enqueue(userId);
        }
      },
    );

    // Interest actions are engagement signals: enqueue a recalc for the actor
    // so any zone-affecting metric changes (e.g. activity rate) propagate immediately.
    await this.consumer.subscribe<InterestExpressedEvent>(
      KafkaTopics.INTEREST_EXPRESSED,
      'scoring-service-interests',
      async (e) => {
        await this.enqueuer.enqueue(e.fromUserId);
      },
    );
  }
}
