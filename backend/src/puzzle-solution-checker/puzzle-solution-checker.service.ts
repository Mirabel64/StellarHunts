import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, timingSafeEqual } from 'crypto';
import { Repository } from 'typeorm';

import { Puzzle } from '../puzzle/puzzle.entity';
import {
  PuzzleAnswerAttempt,
  PuzzleCheckOutcome,
} from './entities/puzzle-answer-attempt.entity';
import { RateLimiterService } from '../rate-limiter/rate-limiter.service';

export const SOLUTION_CHECK_RATE_LIMIT_TTL_SECONDS = 60;
export const SOLUTION_CHECK_RATE_LIMIT_MAX_ATTEMPTS = 10;

export interface CheckSolutionInput {
  puzzleId: string;
  answer: string;
  playerId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface CheckSolutionResult {
  isCorrect: boolean;
  attempts: number;
  feedback: string;
}

@Injectable()
export class PuzzleSolutionCheckerService {
  private readonly logger = new Logger(PuzzleSolutionCheckerService.name);

  constructor(
    @InjectRepository(Puzzle)
    private readonly puzzleRepository: Repository<Puzzle>,
    @InjectRepository(PuzzleAnswerAttempt)
    private readonly attemptRepository: Repository<PuzzleAnswerAttempt>,
    private readonly rateLimiterService: RateLimiterService,
  ) {}

  /**
   * Checks an off-chain answer against the solution stored on the server.
   *
   * The submitted answer is never returned to the caller and only a hash of it
   * is persisted. This keeps the checker deterministic while still producing
   * an audit trail that can be used to detect abusive players or IPs.
   */
  async checkSolution(
    input: CheckSolutionInput,
  ): Promise<CheckSolutionResult> {
    const startedAt = Date.now();
    const identity = input.playerId || input.ipAddress || 'anonymous';
    const rateLimitKey = `puzzle-solution:${identity}:${input.puzzleId}`;

    if (
      this.rateLimiterService.isRateLimited(
        rateLimitKey,
        SOLUTION_CHECK_RATE_LIMIT_TTL_SECONDS,
        SOLUTION_CHECK_RATE_LIMIT_MAX_ATTEMPTS,
      )
    ) {
      await this.logAttempt(input, PuzzleCheckOutcome.RATE_LIMITED, startedAt);
      throw new HttpException(
        'Too many solution checks. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const puzzle = await this.puzzleRepository.findOne({
      where: { id: input.puzzleId, isActive: true },
    });

    if (!puzzle) {
      await this.logAttempt(input, PuzzleCheckOutcome.NOT_FOUND, startedAt);
      throw new NotFoundException('Puzzle not found');
    }

    const isCorrect = this.answersMatch(input.answer, puzzle.solution);
    const outcome = isCorrect
      ? PuzzleCheckOutcome.CORRECT
      : PuzzleCheckOutcome.INCORRECT;
    const attempts = await this.logAttempt(input, outcome, startedAt);

    return {
      isCorrect,
      attempts,
      feedback: isCorrect
        ? 'Correct answer!'
        : 'Incorrect answer. Try again.',
    };
  }

  private answersMatch(submitted: string, expected: string): boolean {
    const submittedDigest = this.digest(this.normalizeAnswer(submitted));
    const expectedDigest = this.digest(this.normalizeAnswer(expected));

    return timingSafeEqual(submittedDigest, expectedDigest);
  }

  private normalizeAnswer(answer: string): string {
    return answer.normalize('NFKC').trim().toLowerCase();
  }

  private digest(value: string): Buffer {
    return createHash('sha256').update(value, 'utf8').digest();
  }

  private async logAttempt(
    input: CheckSolutionInput,
    outcome: PuzzleCheckOutcome,
    startedAt: number,
  ): Promise<number> {
    try {
      const attempt = this.attemptRepository.create({
        puzzleId: input.puzzleId,
        playerId: input.playerId ?? null,
        answerHash: this.digest(this.normalizeAnswer(input.answer)).toString(
          'hex',
        ),
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent?.slice(0, 512) ?? null,
        outcome,
        durationMs: Date.now() - startedAt,
      });

      await this.attemptRepository.save(attempt);

      return await this.countAttempts(input);
    } catch (error) {
      this.logger.error(
        `Failed to persist puzzle solution attempt: ${error.message}`,
      );
      return 0;
    }
  }

  private async countAttempts(input: CheckSolutionInput): Promise<number> {
    if (input.playerId) {
      return this.attemptRepository.count({
        where: { playerId: input.playerId, puzzleId: input.puzzleId },
      });
    }

    if (input.ipAddress) {
      return this.attemptRepository.count({
        where: { ipAddress: input.ipAddress, puzzleId: input.puzzleId },
      });
    }

    return 1;
  }
}
