/**
 * @file KafkaJS-backed implementation of {@link IEventBus} and {@link IEventConsumer}.
 * @module @ghostless/kafka
 */

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Kafka, Producer, Consumer, EachMessagePayload } from 'kafkajs';
import { IEventBus, IEventConsumer, EventHandler } from './event-bus.port';

/**
 * Single client that publishes events and runs one or more consumer groups.
 * Lifecycle is tied to the Nest module via OnModuleInit/Destroy.
 */
@Injectable()
export class KafkaEventBus implements IEventBus, IEventConsumer, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaEventBus.name);
  private kafka!: Kafka;
  private producer!: Producer;
  /** Track consumers for clean shutdown. */
  private consumers: Consumer[] = [];

  /**
   * @param brokers - Kafka broker addresses
   * @param clientId - Unique client id per microservice instance
   */
  constructor(
    private readonly brokers: string[],
    private readonly clientId: string,
  ) {}

  /** Connect producer on application bootstrap. */
  async onModuleInit(): Promise<void> {
    this.kafka = new Kafka({
      clientId: this.clientId,
      brokers: this.brokers,
      retry: { retries: 5 },
    });
    this.producer = this.kafka.producer();
    await this.producer.connect();
    this.logger.log(`Kafka producer connected (${this.brokers.join(',')})`);
  }

  /** Disconnect all Kafka clients on shutdown. */
  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  /**
   * @inheritdoc
   * @remarks Required by {@link IEventConsumer}; lifecycle is normally driven
   * by `onModuleInit`/`onModuleDestroy` — kept for non-Nest consumers and tests.
   */
  async connect(): Promise<void> {
    if (!this.producer) {
      await this.onModuleInit();
    }
  }

  /**
   * @inheritdoc
   * @remarks Required by {@link IEventConsumer}; lifecycle is normally driven
   * by `onModuleInit`/`onModuleDestroy` — kept for non-Nest consumers and tests.
   */
  async disconnect(): Promise<void> {
    for (const c of this.consumers) {
      await c.disconnect();
    }
    this.consumers = [];
    if (this.producer) {
      await this.producer.disconnect();
    }
  }

  /** @inheritdoc */
  async publish<T>(topic: string, key: string, payload: T): Promise<void> {
    await this.producer.send({
      topic,
      messages: [{ key, value: JSON.stringify(payload) }],
    });
  }

  /** @inheritdoc */
  async subscribe<T>(
    topic: string,
    groupId: string,
    handler: EventHandler<T>,
  ): Promise<void> {
    const consumer = this.kafka.consumer({ groupId });
    this.consumers.push(consumer);
    await consumer.connect();
    // Only new messages — scoring also runs periodic full recalc
    await consumer.subscribe({ topic, fromBeginning: false });
    await consumer.run({
      eachMessage: async ({ message }: EachMessagePayload) => {
        if (!message.value) return;
        try {
          const payload = JSON.parse(message.value.toString()) as T;
          await handler(payload);
        } catch (err) {
          this.logger.error(`Failed to handle ${topic}`, err);
        }
      },
    });
    this.logger.log(`Subscribed to ${topic} (group: ${groupId})`);
  }
}
