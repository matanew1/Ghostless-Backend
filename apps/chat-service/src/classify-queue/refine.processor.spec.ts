/**
 * @file Unit tests for the refine worker — only writes when HF disagrees.
 * @module @ghostless/chat-service
 */

import { Job } from 'bullmq';
import { RefineProcessor } from './refine.processor';
import type { RefineJobData } from './refine-enqueuer.service';

function makeJob(data: RefineJobData): Job<RefineJobData> {
  return { data } as Job<RefineJobData>;
}

describe('RefineProcessor', () => {
  it('no-op when LLM agrees with the heuristic', async () => {
    const prisma = { message: { update: jest.fn() } };
    const hf = { classify: jest.fn().mockResolvedValue(true) };
    const processor = new RefineProcessor(prisma as never, hf as never);

    await processor.process(makeJob({ messageId: 'm1', content: 'Hey?', heuristicVerdict: true }));

    expect(hf.classify).toHaveBeenCalledTimes(1);
    expect(prisma.message.update).not.toHaveBeenCalled();
  });

  it('updates the row when LLM disagrees', async () => {
    const prisma = { message: { update: jest.fn().mockResolvedValue({}) } };
    const hf = { classify: jest.fn().mockResolvedValue(true) };
    const processor = new RefineProcessor(prisma as never, hf as never);

    await processor.process(makeJob({
      messageId: 'm2',
      content: 'is anyone home',
      heuristicVerdict: false,
    }));

    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: 'm2' },
      data: { isQuestion: true },
    });
  });

  it('calls HF with the generous worker timeout', async () => {
    const prisma = { message: { update: jest.fn() } };
    const hf = { classify: jest.fn().mockResolvedValue(false) };
    const processor = new RefineProcessor(prisma as never, hf as never);

    await processor.process(makeJob({ messageId: 'm3', content: 'hello', heuristicVerdict: false }));

    const [, , options] = hf.classify.mock.calls[0];
    expect(options.timeoutMs).toBeGreaterThanOrEqual(10_000);
  });
});
