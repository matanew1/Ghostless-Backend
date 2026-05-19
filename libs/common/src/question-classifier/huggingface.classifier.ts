/**
 * @file HF Inference API adapter using a multilingual zero-shot model.
 * @module @ghostless/common
 */

import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import {
  NetworkHttpError,
  NetworkService,
  NetworkTimeoutError,
} from '@ghostless/network';
import { ClassifyOptions, IQuestionClassifier } from './question-classifier.port';
import { MultilingualHeuristicClassifier } from './multilingual-heuristic.classifier';

const MODEL = 'MoritzLaurer/mDeBERTa-v3-base-mnli-xnli';
/**
 * HF migrated their free Serverless Inference to the "Inference Providers" router
 * (early 2025). The legacy `api-inference.huggingface.co` URL now 404s for most
 * models. The router auto-routes to whichever provider hosts the model for free.
 */
const ENDPOINT = `https://router.huggingface.co/hf-inference/models/${MODEL}/pipeline/zero-shot-classification`;
/** Cold starts on the router can take ~1 s; override via `HF_TIMEOUT_MS`. */
const DEFAULT_TIMEOUT_MS = 1_500;

/**
 * Shape of HF zero-shot classification responses on the new Inference Providers
 * router. Returned as a sorted array of {label, score} (highest first).
 */
type ZeroShotResponse = Array<{ label: string; score: number }>;

/**
 * Calls HF zero-shot classification with `["question","statement"]` labels.
 * On any failure or timeout, falls back to {@link MultilingualHeuristicClassifier}
 * so chat send never blocks on an external API.
 */
@Injectable()
export class HuggingFaceQuestionClassifier implements IQuestionClassifier, OnModuleInit {
  private readonly logger = new Logger(HuggingFaceQuestionClassifier.name);
  private readonly token: string | undefined;
  private readonly timeoutMs: number;

  constructor(
    private readonly fallback: MultilingualHeuristicClassifier,
    private readonly network: NetworkService,
    @Optional() @Inject('HF_API_TOKEN') token?: string,
    @Optional() @Inject('HF_TIMEOUT_MS') timeoutMs?: number,
  ) {
    this.token = token ?? process.env.HF_API_TOKEN;
    this.timeoutMs = timeoutMs ?? (Number(process.env.HF_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);
  }

  /**
   * Fire-and-forget warmup so the first real user request doesn't pay the
   * router's cold-start cost (which routinely exceeds 3 s on free-tier).
   * Uses a generous 30 s timeout solely for the warmup call.
   */
  async onModuleInit(): Promise<void> {
    if (!this.token) return;
    try {
      await this.network.postJson<ZeroShotResponse>(
        ENDPOINT,
        { inputs: 'warmup', parameters: { candidate_labels: ['question', 'statement'] } },
        { bearer: this.token, timeoutMs: 30_000 },
      );
      this.logger.log('HF classifier warmed up');
    } catch (err) {
      this.logger.warn(`HF warmup failed (will rely on heuristic until model wakes): ${(err as Error).message}`);
    }
  }

  /** @inheritdoc */
  async classify(text: string, languageHint?: string, options?: ClassifyOptions): Promise<boolean> {
    if (!this.token) return this.fallback.classify(text, languageHint);

    try {
      const data = await this.network.postJson<ZeroShotResponse>(
        ENDPOINT,
        {
          inputs: text,
          parameters: { candidate_labels: ['question', 'statement'] },
        },
        {
          bearer: this.token,
          timeoutMs: options?.timeoutMs ?? this.timeoutMs,
        },
      );
      const top = data[0]?.label;
      if (!top) throw new Error('HF empty response');
      return top === 'question';
    } catch (err) {
      const reason =
        err instanceof NetworkTimeoutError
          ? `timeout after ${err.timeoutMs}ms`
          : err instanceof NetworkHttpError
            ? `HTTP ${err.status}`
            : (err as Error).message;
      this.logger.warn(`HF classify failed, using heuristic: ${reason}`);
      return this.fallback.classify(text, languageHint);
    }
  }
}
