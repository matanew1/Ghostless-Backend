/**
 * @file Port and DI token for message question classification.
 * @module @ghostless/common
 */

/** Nest provider token for the question classifier implementation. */
export const QUESTION_CLASSIFIER = Symbol('QUESTION_CLASSIFIER');

/** Per-call options accepted by {@link IQuestionClassifier.classify}. */
export interface ClassifyOptions {
  /** Override the implementation's default per-request timeout (network adapters only). */
  timeoutMs?: number;
}

/** Classifies whether a message is a question, in any supported language. */
export interface IQuestionClassifier {
  /**
   * @param text - Raw message body.
   * @param languageHint - Optional BCP-47 language tag (e.g. "en", "he", "zh").
   * @param options - Per-call overrides (e.g. timeout for background workers).
   * @returns true when the text is a question.
   */
  classify(text: string, languageHint?: string, options?: ClassifyOptions): Promise<boolean>;
}
