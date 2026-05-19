/**
 * @file HF Inference API adapter using a multilingual zero-shot model.
 * @module @ghostless/common
 */

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  NetworkHttpError,
  NetworkService,
  NetworkTimeoutError,
} from '@ghostless/network';
import { IQuestionClassifier } from './question-classifier.port';
import { MultilingualHeuristicClassifier } from './multilingual-heuristic.classifier';

const MODEL = 'MoritzLaurer/mDeBERTa-v3-base-mnli-xnli';
const ENDPOINT = `https://api-inference.huggingface.co/models/${MODEL}`;
const DEFAULT_TIMEOUT_MS = 500;

/** Shape of HF zero-shot classification responses we care about. */
interface ZeroShotResponse {
  labels?: string[];
  scores?: number[];
}

/**
 * Calls HF zero-shot classification with `["question","statement"]` labels.
 * On any failure or timeout, falls back to {@link MultilingualHeuristicClassifier}
 * so chat send never blocks on an external API.
 */
@Injectable()
export class HuggingFaceQuestionClassifier implements IQuestionClassifier {
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

  /** @inheritdoc */
  async classify(text: string, languageHint?: string): Promise<boolean> {
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
          timeoutMs: this.timeoutMs,
        },
      );
      const top = data.labels?.[0];
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
