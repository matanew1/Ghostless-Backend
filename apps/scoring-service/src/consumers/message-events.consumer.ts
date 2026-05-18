/**
 * @file Kafka consumers for message and match events driving scoring side effects.
 * @module @ghostless/scoring-service
 */

import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import {
  KafkaTopics,
  MessageReadEvent,
  MessageSentEvent,
  MatchCreatedEvent,
} from '@ghostless/contracts';
import { EVENT_CONSUMER, IEventConsumer } from '@ghostless/kafka';
import { ScoringService } from '../scoring/scoring.service';
import { PrismaService } from '@ghostless/database';

/**
 * Wires message sent/read handlers and ensures metrics rows exist for new matches.
 */
@Injectable()
export class MessageEventsConsumer implements OnModuleInit {
  constructor(
    @Inject(EVENT_CONSUMER) private readonly consumer: IEventConsumer,
    private readonly scoring: ScoringService,
    private readonly prisma: PrismaService,
  ) {}

  /** Subscribes to message and match-created topics on module startup. */
  async onModuleInit(): Promise<void> {
    await this.consumer.subscribe<MessageSentEvent>(
      KafkaTopics.MESSAGE_SENT,
      'scoring-service-messages',
      (e) => this.scoring.onMessageSent(e),
    );

    await this.consumer.subscribe<MessageReadEvent>(
      KafkaTopics.MESSAGE_READ,
      'scoring-service-reads',
      (e) => this.scoring.onMessageRead(e),
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
        }
      },
    );
  }
}
