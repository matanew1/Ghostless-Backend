/**
 * @file Kafka topic names for cross-service domain events.
 * @module @ghostless/contracts
 */

/**
 * Canonical Kafka topic identifiers.
 * Producers and consumers must use these constants to stay aligned.
 */
export const KafkaTopics = {
  /** Emitted when a chat message is persisted. */
  MESSAGE_SENT: 'ghostless.message.sent',
  /** Emitted when a user marks messages as read. */
  MESSAGE_READ: 'ghostless.message.read',
  /** Emitted when a mutual match is created. */
  MATCH_CREATED: 'ghostless.match.created',
  /** Emitted after soft zone transition completes. */
  USER_ZONE_CHANGED: 'ghostless.user.zone.changed',
  /** Emitted when a user expresses interest (like) toward another user. */
  INTEREST_EXPRESSED: 'ghostless.user.interest',
  /** Reserved for future inactivity signals. */
  USER_INACTIVE: 'ghostless.user.inactive',
} as const;

/** Union of all Ghostless Kafka topic strings. */
export type KafkaTopic = (typeof KafkaTopics)[keyof typeof KafkaTopics];
