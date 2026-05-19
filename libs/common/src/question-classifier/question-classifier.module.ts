/**
 * @file Nest module exposing the QUESTION_CLASSIFIER provider.
 * @module @ghostless/common
 */

import { Module } from '@nestjs/common';
import { NetworkModule, NetworkService } from '@ghostless/network';
import { QUESTION_CLASSIFIER } from './question-classifier.port';
import { HuggingFaceQuestionClassifier } from './huggingface.classifier';
import { MultilingualHeuristicClassifier } from './multilingual-heuristic.classifier';

/**
 * Provides {@link HuggingFaceQuestionClassifier} backed by
 * {@link MultilingualHeuristicClassifier} as a fallback.
 */
@Module({
  imports: [NetworkModule],
  providers: [
    MultilingualHeuristicClassifier,
    {
      provide: QUESTION_CLASSIFIER,
      useFactory: (fallback: MultilingualHeuristicClassifier, network: NetworkService) =>
        new HuggingFaceQuestionClassifier(fallback, network),
      inject: [MultilingualHeuristicClassifier, NetworkService],
    },
  ],
  exports: [QUESTION_CLASSIFIER, MultilingualHeuristicClassifier],
})
export class QuestionClassifierModule {}
