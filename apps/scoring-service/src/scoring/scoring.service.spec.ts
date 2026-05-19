/**
 * @file Unit tests for ScoringService.recalculateUser — focus on optimistic-concurrency outcomes.
 * @module @ghostless/scoring-service
 */

import { ScoringService } from './scoring.service';
import { MetricsCalculator } from './metrics-calculator';
import { ZoneClassifier } from '../zone/zone-classifier';

function makePrismaWithRevision(opts: {
  revision: number;
  updateCount: number;
  zone?: string;
}) {
  return {
    userMetrics: {
      findUnique: jest.fn().mockResolvedValue({
        userId: 'u1',
        rts: 0.5, eds: 0.5, gi: 0, reciprocity: 0.5, compositeScore: 0.5,
        zone: opts.zone ?? 'UNMAPPED',
        pendingZone: null, pendingZoneRuns: 0,
        totalMessages: 0,
        revision: opts.revision,
        updatedAt: new Date(),
      }),
      updateMany: jest.fn().mockResolvedValue({ count: opts.updateCount }),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    message: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    match: { findMany: jest.fn().mockResolvedValue([]) },
    zoneHistory: { create: jest.fn().mockResolvedValue({}) },
  };
}

describe('ScoringService.recalculateUser', () => {
  const calc = new MetricsCalculator();
  const classifier = new ZoneClassifier();
  const eventBus = { publish: jest.fn().mockResolvedValue(undefined) };

  it('returns "updated" when the optimistic write succeeds', async () => {
    const prisma = makePrismaWithRevision({ revision: 7, updateCount: 1 });
    const svc = new ScoringService(prisma as never, calc, classifier, eventBus as never);

    await expect(svc.recalculateUser('u1')).resolves.toBe('updated');

    expect(prisma.userMetrics.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1', revision: 7 },
        data: expect.objectContaining({ revision: { increment: 1 } }),
      }),
    );
  });

  it('returns "stale" when updateMany finds 0 matching rows (race lost)', async () => {
    const prisma = makePrismaWithRevision({ revision: 7, updateCount: 0 });
    const svc = new ScoringService(prisma as never, calc, classifier, eventBus as never);

    await expect(svc.recalculateUser('u1')).resolves.toBe('stale');

    // Did NOT emit a zone-change event on a stale write
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('returns "updated" without writing when the user has no metrics row', async () => {
    const prisma = {
      userMetrics: { findUnique: jest.fn().mockResolvedValue(null), updateMany: jest.fn() },
    } as never;
    const svc = new ScoringService(prisma, calc, classifier, eventBus as never);
    await expect(svc.recalculateUser('nope')).resolves.toBe('updated');
    expect((prisma as { userMetrics: { updateMany: jest.Mock } }).userMetrics.updateMany)
      .not.toHaveBeenCalled();
  });
});
