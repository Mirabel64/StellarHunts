import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PuzzleSubmission } from './puzzle-submission.entity';
import { PuzzleSubmissionService } from './puzzle-submission.service';
import { RateLimiterModule } from '../rate-limiter/rate-limiter.module';
import { PuzzleSubmissionController } from './puzzle-submission.controller';
import { Puzzle } from '../puzzle/puzzle.entity';

@Module({
  imports: [
    // PuzzleSubmissionService grades against the server-side puzzle record,
    // so the Puzzle repository must be available in this module's context.
    TypeOrmModule.forFeature([PuzzleSubmission, Puzzle]),
    RateLimiterModule,
  ],
  providers: [PuzzleSubmissionService],
  controllers: [PuzzleSubmissionController],
})
export class PuzzleSubmissionModule {}
