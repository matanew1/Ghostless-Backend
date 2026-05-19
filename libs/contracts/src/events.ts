/**
 * @file Typed payloads for Ghostless Kafka events.
 * @module @ghostless/contracts
 */

import { Zone } from './enums';

/** Payload for {@link KafkaTopics.MESSAGE_SENT}. */
export interface MessageSentEvent {
  messageId: string;
  matchId: string;
  senderId: string;
  /** ISO-8601 timestamp. */
  sentAt: string;
  /** Character length of message body. */
  length: number;
  /** Whether the message was classified as a question at ingest. */
  isQuestion: boolean;
}

/** Payload for {@link KafkaTopics.MESSAGE_READ}. */
export interface MessageReadEvent {
  matchId: string;
  readerId: string;
  /** ISO-8601 timestamp. */
  readAt: string;
}

/** Payload for {@link KafkaTopics.MATCH_CREATED}. */
export interface MatchCreatedEvent {
  matchId: string;
  userAId: string;
  userBId: string;
}

/** Payload for {@link KafkaTopics.USER_ZONE_CHANGED}. */
export interface UserZoneChangedEvent {
  userId: string;
  zone: Zone;
  previousZone: Zone;
}

/** Payload for {@link KafkaTopics.USER_INACTIVE} (future). */
export interface UserInactiveEvent {
  userId: string;
  /** ISO-8601 last-seen timestamp. */
  lastSeenAt: string;
}
