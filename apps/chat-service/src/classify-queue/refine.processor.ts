/**
 * @file Worker that asks HF for a verdict and rewrites isQuestion when it disagrees with the heuristic.
 * @module @ghostless/chat-service
 */

import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '@ghostless/database';
import { IQuestionClassifier, QUESTION_CLASSIFIER } from '@ghostless/common';
import { RefineJobData } from './refine-enqueuer.service';
import {
  REFINE_CONCURRENCY,
  REFINE_HF_TIMEOUT_MS,
  REFINE_QUEUE,
} from './classify-queue.constants';

/**
 * Runs off the user-visible send path, so a 30-second cold-start at HF
 * has zero impact on chat latency. Only updates the row when HF actually
 * disagrees with the heuristic, keeping write traffic minimal.
 */
@Processor(REFINE_QUEUE, { concurrency: REFINE_CONCURRENCY })
export class RefineProcessor extends WorkerHost {
  private readonly logger = new Logger(RefineProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(QUESTION_CLASSIFIER) private readonly hf: IQuestionClassifier,
  ) {
    super();
  }

  async process(job: Job<RefineJobData>): Promise<void> {
    const { messageId, content, heuristicVerdict } = job.data;
    const llmVerdict = await this.hf.classify(content, undefined, {
      timeoutMs: REFINE_HF_TIMEOUT_MS,
    });
    if (llmVerdict === heuristicVerdict) return;

    await this.prisma.message.update({
      where: { id: messageId },
      data: { isQuestion: llmVerdict },
    });
    this.logger.log(
      `Refined ${messageId}: heuristic=${heuristicVerdict} → llm=${llmVerdict}`,
    );
  }
}
