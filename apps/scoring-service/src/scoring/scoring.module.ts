/**
 * @file Nest module for scoring service, scheduled jobs, and zone classification.
 * @module @ghostless/scoring-service
 */

import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ScoringService } from './scoring.service';
import { ScoringJob } from './scoring.job';
import { MetricsCalculator } from './metrics-calculator';
import { ZoneClassifier } from '../zone/zone-classifier';

/** Scoring domain — cron job, calculators, and exported {@link ScoringService}. */
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [ScoringService, ScoringJob, MetricsCalculator, ZoneClassifier],
  exports: [ScoringService],
})
export class ScoringModule {}
