/**
 * @file Pure functions for RTS, EDS, ghost index, reciprocity, and composite score.
 * @module @ghostless/scoring-service
 */

import { Injectable } from '@nestjs/common';

/** Raw inputs that can be aggregated before metric formulas run. */
export interface RawStats {
  responseTimesMs: number[];
  messageLengths: number[];
  /** Messages classified as questions (multilingual; not a raw `?` count). */
  questionCount: number;
  messageCount: number;
  threadDepth: number;
  unreadConversations: number;
  totalConversations: number;
  reciprocitySamples: number[];
}

/**
 * Stateless metric formulas (response-time score, engagement depth, ghost index, etc.).
 */
@Injectable()
export class MetricsCalculator {
  private readonly kMs = 12 * 60 * 60 * 1000; // 12h decay constant for RTS
  private readonly giLambda = 0.01;

  /**
   * Response-time score: higher when average reply latency is low.
   *
   * @param responseTimesMs - Inter-message delays in milliseconds
   */
  computeRts(responseTimesMs: number[]): number {
    if (responseTimesMs.length === 0) return 0.5;
    const avg = responseTimesMs.reduce((a, b) => a + b, 0) / responseTimesMs.length;
    return Math.exp(-avg / this.kMs); // Exponential decay function - e^(−avg/k)
  }

  /**
   * Engagement depth score from length, questions, and thread depth.
   *
   * @param messageLengths - Character lengths per message
   * @param questionCount - Messages classified as questions (multilingual; precomputed at ingest)
   * @param messageCount - Total messages (denominator)
   * @param threadDepth - Active thread depth cap input
   */
  computeEds(
    messageLengths: number[],
    questionCount: number,
    messageCount: number,
    threadDepth: number,
  ): number {
    // Guard on the actual divisor — caller may pass a sentinel for `messageCount`.
    if (messageLengths.length === 0 || messageCount === 0) return 0.5;
    const avgLen = messageLengths.reduce((a, b) => a + b, 0) / messageLengths.length;
    const normLen = Math.min(avgLen / 200, 1);
    const questionRatio = questionCount / messageCount;
    const depthNorm = Math.min(threadDepth / 10, 1);
    return Math.min(normLen * (0.5 + questionRatio) * (0.5 + depthNorm), 1);
  }

  /**
   * Ghost index: blend of unread ratio and time-decayed previous GI.
   *
   * @param unread - Conversations with unread peer messages
   * @param total - Total conversations
   * @param previousGi - Prior ghost index
   * @param hoursSinceUpdate - Hours since last metrics update
   */
  computeGi(unread: number, total: number, previousGi: number, hoursSinceUpdate: number): number {
    const base = total > 0 ? unread / total : 0;
    const decayed = previousGi * Math.exp(-this.giLambda * hoursSinceUpdate);
    return Math.max(base, decayed * 0.5 + base * 0.5);
  }

  /**
   * Average reciprocity across match-level send balance samples.
   *
   * @param samples - Per-match min/max send ratios
   */
  computeReciprocity(samples: number[]): number {
    if (samples.length === 0) return 0.5;
    return samples.reduce((a, b) => a + b, 0) / samples.length;
  }

  /**
   * Weighted composite of RTS, EDS, reciprocity minus ghost penalty.
   *
   * @param rts - Response-time score
   * @param eds - Engagement depth score
   * @param reciprocity - Reciprocity score
   * @param gi - Ghost index
   */
  composite(rts: number, eds: number, reciprocity: number, gi: number): number {
    return 0.4 * rts + 0.35 * eds + 0.25 * reciprocity - 0.2 * gi;
  }
}

// The formula

// Score=0.4⋅RTS+0.35⋅EDS+0.25⋅Reciprocity−0.2⋅GI

// What it’s doing conceptually

// You’re building a behavioral quality index:

// Signal	Meaning
// RTS	responsiveness (speed)
// EDS	engagement depth (quality of interaction)
// Reciprocity	balance of effort
// GI	ghosting penalty (anti-behavior signal)

// So the system rewards:

// fast replies
// deep conversations
// mutual effort

// and penalizes:

// unread/ignored behavior
// Breaking down each weight
// 1. RTS — 0.4 (highest weight)

// “How responsive is the user?”

// Why it’s highest:

// response time is the strongest early signal of engagement
// strongly correlated with real-world interaction quality
// highly predictive in dating/chat systems
// 2. EDS — 0.35

// “How meaningful are conversations?”

// Almost as important as speed.

// Captures:

// curiosity
// message richness
// thread depth

// This prevents “fast but shallow” users from dominating.

// 3. Reciprocity — 0.25

// “Is effort balanced?”

// Important but slightly lower weight because:

// it’s match-dependent (not always user-controlled)
// can be noisy across small samples

// Still crucial for fairness.

// 4. GI penalty — -0.2

// “Do they ghost people?”

// This is a negative correction term, not a feature.

// Why it matters:

// even high engagement users should be penalized if they ghost
// enforces trustworthiness
// Full interpretation

// Your model is essentially:

// “Rank users by engagement quality, but strongly punish ghosting behavior.”
