/**
 * @file Kafka consumer reacting to user zone changes (cache invalidation hook).
 * @module @ghostless/user-service
 */

import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { KafkaTopics, UserZoneChangedEvent } from '@ghostless/contracts';
import { EVENT_CONSUMER, IEventConsumer } from '@ghostless/kafka';

/**
 * Subscribes to {@link KafkaTopics.USER_ZONE_CHANGED} for future cache invalidation.
 * Currently logs zone transitions only.
 */
@Injectable()
export class ZoneChangedConsumer implements OnModuleInit {
  private readonly logger = new Logger(ZoneChangedConsumer.name);

  constructor(@Inject(EVENT_CONSUMER) private readonly consumer: IEventConsumer) {}

  /** Registers the zone-changed handler on module startup. */
  async onModuleInit(): Promise<void> {
    await this.consumer.subscribe<UserZoneChangedEvent>(
      KafkaTopics.USER_ZONE_CHANGED,
      'user-service-zone',
      async (event) => {
        this.logger.log(`Zone cache invalidate for user ${event.userId} → ${event.zone}`);
      },
    );
  }
}
