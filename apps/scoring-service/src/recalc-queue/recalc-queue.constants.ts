/**
 * @file Queue and tuning constants for the BullMQ-based recalc pipeline.
 * @module @ghostless/scoring-service
 */

/** BullMQ queue name. */
export const RECALC_QUEUE = 'scoring-recalc';

/** Token for the shared ioredis client used by both BullMQ and the per-user mutex. */
export const RECALC_REDIS = Symbol('RECALC_REDIS');

/** Debounce window: how long to wait before processing a freshly enqueued user. */
export const DEFAULT_DEBOUNCE_MS = 10_000;

/** Per-user mutex TTL — must exceed worst-case `recalculateUser` runtime. */
export const LOCK_TTL_SECONDS = 60;

/** Re-queue delay when the mutex is already held by another worker. */
export const LOCK_RETRY_DELAY_MS = 2_000;

/** Default worker concurrency (across *different* users). */
export const DEFAULT_CONCURRENCY = 8;
