/**
 * @file Port and DI token for message question classification.
 * @module @ghostless/common
 */

/** Nest provider token for the question classifier implementation. */
export const QUESTION_CLASSIFIER = Symbol('QUESTION_CLASSIFIER');

/** Classifies whether a message is a question, in any supported language. */
export interface IQuestionClassifier {
  /**
   * @param text - Raw message body.
   * @param languageHint - Optional BCP-47 language tag (e.g. "en", "he", "zh").
   * @returns true when the text is a question.
   */
  classify(text: string, languageHint?: string): Promise<boolean>;
}
