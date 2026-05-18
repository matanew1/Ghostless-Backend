/**
 * @file NestJS injection tokens for Kafka abstractions.
 * @module @ghostless/kafka
 */

/** DI token for {@link IEventBus} implementations. */
export const EVENT_BUS = Symbol('EVENT_BUS');

/** DI token for {@link IEventConsumer} implementations. */
export const EVENT_CONSUMER = Symbol('EVENT_CONSUMER');
