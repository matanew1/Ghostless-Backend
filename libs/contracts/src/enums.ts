/**
 * @file Shared behavioral zone enum and display helpers for Ghostless.
 * @module @ghostless/contracts
 */

/** Communication-behavior cluster assigned by the scoring service. */
export enum Zone {
  /** Sporadic presence, high ghost index, low reciprocity. */
  GHOST_TOWN = 'GHOST_TOWN',
  /** Slow but reciprocal pacing. */
  CHILL = 'CHILL',
  /** Balanced pace and depth. */
  STEADY = 'STEADY',
  /** Fast replies, shorter messages. */
  PULSE = 'PULSE',
  /** Fast replies with high engagement depth. */
  SPARK = 'SPARK',
  /** Internal cold-start state before enough messages exist. */
  UNMAPPED = 'UNMAPPED',
}

/**
 * Maps internal zones to client-visible labels.
 * UNMAPPED (legacy cold-start state) is shown as STEADY — the center of the spectrum.
 *
 * @param zone - Raw zone from persistence or scoring
 * @returns Zone safe to expose on public APIs
 */
export function toDisplayZone(zone: Zone): Zone {
  return zone === Zone.UNMAPPED ? Zone.STEADY : zone;
}
