/**
 * @file Unit tests for the scoring formulas, including the NaN regression.
 * @module @ghostless/scoring-service
 */

import { MetricsCalculator } from './metrics-calculator';

describe('MetricsCalculator', () => {
  const calc = new MetricsCalculator();

  describe('computeRts', () => {
    it('returns 0.5 when no response times are recorded', () => {
      expect(calc.computeRts([])).toBe(0.5);
    });

    it('returns near 1.0 for very fast replies and near 0.0 for very slow', () => {
      const fast = calc.computeRts([1_000, 2_000]); // 1-2 s
      const slow = calc.computeRts([24 * 60 * 60 * 1000, 24 * 60 * 60 * 1000]); // 24h
      expect(fast).toBeGreaterThan(0.95);
      expect(slow).toBeLessThan(0.2);
    });
  });

  describe('computeEds (the NaN bug regression)', () => {
    it('returns 0.5 — not NaN — when messageLengths is empty', () => {
      // Caller may still pass a non-zero messageCount sentinel.
      const result = calc.computeEds([], 0, 1, 0);
      expect(result).toBe(0.5);
      expect(Number.isNaN(result)).toBe(false);
    });

    it('returns 0.5 when messageCount is 0', () => {
      expect(calc.computeEds([100, 200], 1, 0, 5)).toBe(0.5);
    });

    it('produces a finite number within [0,1] for normal inputs', () => {
      const result = calc.computeEds([80, 120, 200], 2, 3, 4);
      expect(Number.isFinite(result)).toBe(true);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1);
    });
  });

  describe('computeGi', () => {
    it('returns 0 when no conversations and no prior GI', () => {
      expect(calc.computeGi(0, 0, 0, 0)).toBe(0);
    });

    it('uses the max of fresh unread ratio and decayed prior', () => {
      const fresh = calc.computeGi(5, 10, 0, 0); // 0.5 fresh
      expect(fresh).toBeCloseTo(0.5);
      // No fresh signal but high prior — decayed
      const decayed = calc.computeGi(0, 1, 0.8, 24);
      expect(decayed).toBeGreaterThan(0);
      expect(decayed).toBeLessThan(0.5);
    });
  });

  describe('computeReciprocity', () => {
    it('returns 0.5 with no samples', () => {
      expect(calc.computeReciprocity([])).toBe(0.5);
    });

    it('averages min/max ratios', () => {
      expect(calc.computeReciprocity([0.5, 1.0])).toBeCloseTo(0.75);
    });
  });

  describe('composite', () => {
    it('weights according to the documented formula', () => {
      // 0.4*1 + 0.35*1 + 0.25*1 - 0.2*0 = 1.0
      expect(calc.composite(1, 1, 1, 0)).toBeCloseTo(1.0);
      // 0.4*0 + 0.35*0 + 0.25*0 - 0.2*1 = -0.2
      expect(calc.composite(0, 0, 0, 1)).toBeCloseTo(-0.2);
    });

    it('never produces NaN with finite inputs', () => {
      const result = calc.composite(0.5, 0.5, 0.5, 0.1);
      expect(Number.isFinite(result)).toBe(true);
    });
  });
});
