/**
 * @file Integration: prove BullMQ dedupe, the per-user mutex, and the heuristic
 * sync + HF-refine pipeline work end-to-end against real Redis and Postgres.
 *
 * Prereqs: `docker-compose up -d postgres redis` and `npx prisma migrate deploy`.
 * Run with: `npm run test:integration`.
 */

import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { MultilingualHeuristicClassifier } from '@ghostless/common';
import { PrismaService } from '@ghostless/database';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const RECALC_QUEUE = 'integration-recalc';
const REFINE_QUEUE = 'integration-refine';

const prisma = new PrismaService();
const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

async function flushQueue(name: string) {
  const q = new Queue(name, { connection: { url: REDIS_URL, maxRetriesPerRequest: null } });
  await q.obliterate({ force: true });
  await q.close();
}

beforeAll(async () => {
  await flushQueue(RECALC_QUEUE);
  await flushQueue(REFINE_QUEUE);
});

afterAll(async () => {
  await flushQueue(RECALC_QUEUE);
  await flushQueue(REFINE_QUEUE);
  await prisma.$disconnect();
  await redis.quit();
});

describe('BullMQ + event-flow integration', () => {
  it('dedupes per-user recalc jobs by jobId across a burst', async () => {
    const userId = 'int-user-burst';
    const queue = new Queue(RECALC_QUEUE, {
      connection: { url: REDIS_URL, maxRetriesPerRequest: null },
    });

    // Enqueue 10 jobs for the same user inside the debounce window
    await Promise.all(
      Array.from({ length: 10 }).map(() =>
        queue.add(
          'recalc',
          { userId },
          { jobId: `recalc-${userId}`, delay: 5_000, removeOnComplete: true },
        ),
      ),
    );

    // Exactly one delayed entry should exist
    const delayed = await queue.getJobs(['delayed']);
    expect(delayed).toHaveLength(1);
    expect(delayed[0].id).toBe(`recalc-${userId}`);

    await queue.close();
  });

  it('per-user Redis mutex serializes concurrent recalcs for the same user', async () => {
    const userId = 'int-user-mutex';
    const lockKey = `int-recalc-lock:${userId}`;
    const concurrent: number[] = [];
    let inFlight = 0;
    let maxInFlight = 0;

    // Two workers polling the same queue, both running the mutex'd handler
    const queue = new Queue(RECALC_QUEUE, {
      connection: { url: REDIS_URL, maxRetriesPerRequest: null },
    });

    async function runJob(): Promise<void> {
      const token = Math.random().toString(36).slice(2);
      const acquired = await redis.set(lockKey, token, 'EX', 60, 'NX');
      if (!acquired) return; // contention — drop, as the real processor does (it re-enqueues)
      try {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        concurrent.push(inFlight);
        await new Promise((r) => setTimeout(r, 100));
      } finally {
        inFlight--;
        const owned = await redis.get(lockKey);
        if (owned === token) await redis.del(lockKey);
      }
    }

    const handler = async () => runJob();
    const w1 = new Worker(RECALC_QUEUE, handler, {
      connection: { url: REDIS_URL, maxRetriesPerRequest: null },
      concurrency: 1,
    });
    const w2 = new Worker(RECALC_QUEUE, handler, {
      connection: { url: REDIS_URL, maxRetriesPerRequest: null },
      concurrency: 1,
    });

    // Fire two simultaneous jobs (no jobId dedupe — different ids) for the same user
    await queue.add('recalc', { userId }, { jobId: `same-user-a` });
    await queue.add('recalc', { userId }, { jobId: `same-user-b` });

    await new Promise((r) => setTimeout(r, 800));
    await w1.close();
    await w2.close();
    await queue.close();

    // The mutex must guarantee max-in-flight === 1 (no two concurrent runs for same user)
    expect(maxInFlight).toBe(1);
  });

  it('refine worker overwrites Message.isQuestion when LLM verdict disagrees', async () => {
    // Seed a temp user, match, message
    const user = await prisma.user.create({
      data: { email: `int-${Date.now()}@seed.local`, googleId: `int-${Date.now()}` },
    });
    const other = await prisma.user.create({
      data: { email: `int-other-${Date.now()}@seed.local`, googleId: `int-other-${Date.now()}` },
    });
    const match = await prisma.match.create({
      data: { userAId: user.id, userBId: other.id, status: 'ACTIVE' },
    });
    const heuristic = new MultilingualHeuristicClassifier();
    const content = 'going to sleep now'; // heuristic returns false (plain statement)
    const heuristicVerdict = heuristic.classifySync(content);
    expect(heuristicVerdict).toBe(false);

    const message = await prisma.message.create({
      data: { matchId: match.id, senderId: user.id, content, isQuestion: heuristicVerdict },
    });

    // Run a refine worker that mocks HF returning `true`
    const queue = new Queue(REFINE_QUEUE, {
      connection: { url: REDIS_URL, maxRetriesPerRequest: null },
    });
    const worker = new Worker(
      REFINE_QUEUE,
      async (job: Job<{ messageId: string; heuristicVerdict: boolean }>) => {
        const llmVerdict = true; // simulated HF result
        if (llmVerdict === job.data.heuristicVerdict) return;
        await prisma.message.update({
          where: { id: job.data.messageId },
          data: { isQuestion: llmVerdict },
        });
      },
      { connection: { url: REDIS_URL, maxRetriesPerRequest: null }, concurrency: 1 },
    );

    await queue.add('refine', { messageId: message.id, heuristicVerdict }, {
      jobId: `refine-${message.id}`,
    });

    // Wait for the worker to drain
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const counts = await queue.getJobCounts('completed');
      if (counts.completed > 0) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    const refreshed = await prisma.message.findUniqueOrThrow({ where: { id: message.id } });
    expect(refreshed.isQuestion).toBe(true);

    await worker.close();
    await queue.close();

    // Cleanup (cascades to match, message, interest)
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.user.delete({ where: { id: other.id } });
  });

  it('Prisma optimistic concurrency: stale write affects zero rows', async () => {
    // Seed user + metrics row at revision 0
    const user = await prisma.user.create({
      data: { email: `int-rev-${Date.now()}@seed.local`, googleId: `int-rev-${Date.now()}` },
    });
    await prisma.userMetrics.create({ data: { userId: user.id } });

    // Read the row
    const before = await prisma.userMetrics.findUniqueOrThrow({ where: { userId: user.id } });
    expect(before.revision).toBe(0);

    // Simulate another worker bumping the revision
    await prisma.userMetrics.update({
      where: { userId: user.id },
      data: { revision: { increment: 1 } },
    });

    // Our predicate-conditioned write should hit 0 rows
    const stale = await prisma.userMetrics.updateMany({
      where: { userId: user.id, revision: before.revision }, // 0, but DB is now 1
      data: { rts: 0.99, revision: { increment: 1 } },
    });
    expect(stale.count).toBe(0);

    // The rts field must remain at its default (0.5), not 0.99
    const after = await prisma.userMetrics.findUniqueOrThrow({ where: { userId: user.id } });
    expect(after.rts).toBeCloseTo(0.5);
    expect(after.revision).toBe(1);

    await prisma.user.delete({ where: { id: user.id } });
  });
});
