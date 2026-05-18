/**
 * @file Port interfaces for the event bus (SOLID dependency inversion).
 * @module @ghostless/kafka
 */

/**
 * Publishes domain events to the message bus.
 * Implementations must be idempotent-safe at the consumer level.
 */
export interface IEventBus {
  /**
   * Publish a JSON-serializable payload to a topic.
   *
   * @param topic - Kafka topic name
   * @param key - Partition key (usually entity id)
   * @param payload - Event body
   */
  publish<T>(topic: string, key: string, payload: T): Promise<void>;
}

/** Async handler invoked for each consumed message. */
export type EventHandler<T> = (payload: T) => Promise<void>;

/**
 * Subscribes to topics with a consumer group.
 * Used by scoring, matching, and user services.
 */
export interface IEventConsumer {
  /**
   * Register a consumer group handler for a topic.
   *
   * @param topic - Kafka topic name
   * @param groupId - Consumer group id (per service)
   * @param handler - Deserialized payload handler
   */
  subscribe<T>(topic: string, groupId: string, handler: EventHandler<T>): Promise<void>;

  /** Connect producers/consumers (no-op if already connected). */
  connect(): Promise<void>;

  /** Gracefully disconnect all clients. */
  disconnect(): Promise<void>;
}
