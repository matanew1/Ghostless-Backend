/**
 * @file NestJS dynamic module wiring for {@link KafkaEventBus}.
 * @module @ghostless/kafka
 */

import { DynamicModule, Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { KafkaEventBus } from './kafka-event-bus';
import { EVENT_BUS, EVENT_CONSUMER } from './tokens';

/** Options for {@link KafkaModule.forRoot}. */
export interface KafkaModuleOptions {
  brokers: string[];
  clientId: string;
}

/**
 * Global Kafka module — registers event bus ports for injection.
 */
@Global()
@Module({})
export class KafkaModule {
  /**
   * Register Kafka with explicit broker list.
   *
   * @param options - Broker URLs and client id
   */
  static forRoot(options: KafkaModuleOptions): DynamicModule {
    const busProvider = {
      provide: KafkaEventBus,
      useFactory: () => new KafkaEventBus(options.brokers, options.clientId),
    };

    return {
      module: KafkaModule,
      providers: [
        busProvider,
        { provide: EVENT_BUS, useExisting: KafkaEventBus },
        { provide: EVENT_CONSUMER, useExisting: KafkaEventBus },
      ],
      exports: [KafkaEventBus, EVENT_BUS, EVENT_CONSUMER],
    };
  }

  /**
   * Register Kafka using `KAFKA_BROKERS` and `KAFKA_CLIENT_ID` from ConfigService.
   *
   * @param suffix - Appended to client id (e.g. `chat`, `scoring`)
   */
  static forRootFromConfig(suffix: string): DynamicModule {
    return {
      module: KafkaModule,
      imports: [ConfigModule],
      providers: [
        {
          provide: KafkaEventBus,
          useFactory: (config: ConfigService) => {
            const brokers = (config.get<string>('KAFKA_BROKERS') ?? 'localhost:19092').split(',');
            const base = config.get<string>('KAFKA_CLIENT_ID', 'ghostless');
            return new KafkaEventBus(brokers, `${base}-${suffix}`);
          },
          inject: [ConfigService],
        },
        { provide: EVENT_BUS, useExisting: KafkaEventBus },
        { provide: EVENT_CONSUMER, useExisting: KafkaEventBus },
      ],
      exports: [KafkaEventBus, EVENT_BUS, EVENT_CONSUMER],
    };
  }
}
