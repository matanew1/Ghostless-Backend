/**
 * @file Constants for the async question-classification refine pipeline.
 * @module @ghostless/chat-service
 */

/** BullMQ queue name for HF refine jobs. */
export const REFINE_QUEUE = 'chat-classify-refine';

/**
 * Worker timeout per HF call. Generous because users are not blocked on this path.
 * Cold-start on the HF Inference Providers router can take 20+ s.
 */
export const REFINE_HF_TIMEOUT_MS = 30_000;

/** Worker concurrency — modest, since the HF free tier rate-limits. */
export const REFINE_CONCURRENCY = 2;
