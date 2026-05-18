/**
 * @file Kafka consumer that seeds interaction rows when a match is created.
 * @module @ghostless/chat-service
 */

import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { KafkaTopics, MatchCreatedEvent } from '@ghostless/contracts';
import { EVENT_CONSUMER, IEventConsumer } from '@ghostless/kafka';
import { PrismaService } from '@ghostless/database';

/**
 * Listens for {@link KafkaTopics.MATCH_CREATED} and ensures an {@link Interaction} row exists.
 */
@Injectable()
export class MatchCreatedConsumer implements OnModuleInit {
  private readonly logger = new Logger(MatchCreatedConsumer.name);

  constructor(
    @Inject(EVENT_CONSUMER) private readonly consumer: IEventConsumer,
    private readonly prisma: PrismaService,
  ) {}

  /** Registers the match-created handler on module startup. */
  async onModuleInit(): Promise<void> {
    await this.consumer.subscribe<MatchCreatedEvent>(
      KafkaTopics.MATCH_CREATED,
      'chat-service-match',
      async (event) => {
        await this.prisma.interaction.upsert({
          where: { matchId: event.matchId },
          create: {
            matchId: event.matchId,
            userAId: event.userAId,
            userBId: event.userBId,
            messageCount: 0,
          },
          update: {},
        });
        this.logger.log(`Interaction ready for match ${event.matchId}`);
      },
    );
  }
}
