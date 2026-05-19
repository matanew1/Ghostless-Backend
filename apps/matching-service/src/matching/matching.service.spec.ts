/**
 * @file Unit tests for MatchingService.discovery — focus on the gender filter.
 * @module @ghostless/matching-service
 */

import { MatchingService } from './matching.service';

function makePrisma(opts: {
  me: { gender: string | null; seekingGenders: string[]; tags?: string[] };
  candidates: Array<{
    userId: string;
    gender: string;
    seekingGenders: string[];
    tags?: string[];
  }>;
  matches?: Array<{ userAId: string; userBId: string }>;
}) {
  return {
    userProfile: {
      findUnique: jest.fn().mockResolvedValue({
        userId: 'me',
        tags: opts.me.tags ?? [],
        gender: opts.me.gender,
        seekingGenders: opts.me.seekingGenders,
      }),
      // Mimics the Prisma where: {gender: {in: ...}, seekingGenders: {has: ...}}
      findMany: jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
        const required = (where.gender as { in?: string[] } | undefined)?.in;
        const reciprocal = (where.seekingGenders as { has?: string } | undefined)?.has;
        return Promise.resolve(
          opts.candidates
            .filter((c) => !required || required.includes(c.gender))
            .filter((c) => !reciprocal || c.seekingGenders.includes(reciprocal))
            .map((c) => ({ userId: c.userId, tags: c.tags ?? [] })),
        );
      }),
    },
    userMetrics: {
      findUnique: jest.fn().mockResolvedValue({ rts: 0.5, gi: 0, zone: 'UNMAPPED' }),
    },
    match: { findMany: jest.fn().mockResolvedValue(opts.matches ?? []) },
  };
}

const matrix = { getScore: () => 1 };
const eventBus = { publish: jest.fn() };

describe('MatchingService.discovery — gender filter', () => {
  it('returns [] when caller has not set gender', async () => {
    const prisma = makePrisma({
      me: { gender: null, seekingGenders: ['FEMALE'] },
      candidates: [{ userId: 'a', gender: 'FEMALE', seekingGenders: ['MALE'] }],
    });
    const svc = new MatchingService(prisma as never, eventBus as never);
    (svc as unknown as { matrix: typeof matrix }).matrix = matrix;
    await expect(svc.discovery('me')).resolves.toEqual([]);
  });

  it('returns [] when caller has empty seekingGenders', async () => {
    const prisma = makePrisma({
      me: { gender: 'MALE', seekingGenders: [] },
      candidates: [{ userId: 'a', gender: 'FEMALE', seekingGenders: ['MALE'] }],
    });
    const svc = new MatchingService(prisma as never, eventBus as never);
    (svc as unknown as { matrix: typeof matrix }).matrix = matrix;
    await expect(svc.discovery('me')).resolves.toEqual([]);
  });

  it('shows only mutually-compatible candidates (straight male seeking female)', async () => {
    const prisma = makePrisma({
      me: { gender: 'MALE', seekingGenders: ['FEMALE'] },
      candidates: [
        { userId: 'maya',  gender: 'FEMALE', seekingGenders: ['MALE'] },           // ✓
        { userId: 'sara',  gender: 'FEMALE', seekingGenders: ['FEMALE'] },         // ✗ doesn't seek MALE
        { userId: 'bob',   gender: 'MALE',   seekingGenders: ['FEMALE'] },         // ✗ wrong gender for me
        { userId: 'alex',  gender: 'NON_BINARY', seekingGenders: ['MALE'] },       // ✗ I don't seek NB
      ],
    });
    const svc = new MatchingService(prisma as never, eventBus as never);
    (svc as unknown as { matrix: typeof matrix }).matrix = matrix;

    const results = await svc.discovery('me');
    const ids = results.map((r) => r.userId);
    expect(ids).toEqual(['maya']);
  });

  it('shows inclusive candidates (female seeking MALE+FEMALE)', async () => {
    const prisma = makePrisma({
      me: { gender: 'FEMALE', seekingGenders: ['MALE', 'FEMALE'] },
      candidates: [
        { userId: 'm', gender: 'MALE',   seekingGenders: ['FEMALE'] },           // ✓
        { userId: 'f', gender: 'FEMALE', seekingGenders: ['FEMALE'] },           // ✓
        { userId: 'x', gender: 'MALE',   seekingGenders: ['MALE'] },             // ✗ doesn't seek FEMALE
      ],
    });
    const svc = new MatchingService(prisma as never, eventBus as never);
    (svc as unknown as { matrix: typeof matrix }).matrix = matrix;

    const ids = (await svc.discovery('me')).map((r) => r.userId).sort();
    expect(ids).toEqual(['f', 'm']);
  });
});
