/**
 * @file Kafka consumer that refreshes in-memory zone cache for matching.
 * @module @ghostless/matching-service
 */

import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { KafkaTopics, UserZoneChangedEvent } from '@ghostless/contracts';
import { EVENT_CONSUMER, IEventConsumer } from '@ghostless/kafka';
import { MatchingService } from '../matching/matching.service';

/**
 * Keeps {@link MatchingService} zone cache in sync with scoring-driven zone changes.
 */
@Injectable()
export class ZoneChangedConsumer implements OnModuleInit {
  constructor(
    @Inject(EVENT_CONSUMER) private readonly consumer: IEventConsumer,
    private readonly matching: MatchingService,
  ) {}

  /** Registers the zone-changed handler on module startup. */
  async onModuleInit(): Promise<void> {
    await this.consumer.subscribe<UserZoneChangedEvent>(
      KafkaTopics.USER_ZONE_CHANGED,
      'matching-service-zone',
      async (event) => {
        this.matching.invalidateZoneCache(event.userId);
        this.matching.setZoneCache(event.userId, event.zone);
      },
    );
  }
}
