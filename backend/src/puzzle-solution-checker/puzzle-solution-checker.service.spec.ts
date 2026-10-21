import { HttpException, NotFoundException } from '@nestjs/common';

import { Puzzle } from '../puzzle/puzzle.entity';
import {
  PuzzleAnswerAttempt,
  PuzzleCheckOutcome,
} from './entities/puzzle-answer-attempt.entity';
import { PuzzleSolutionCheckerService } from './puzzle-solution-checker.service';

describe('PuzzleSolutionCheckerService', () => {
  let service: PuzzleSolutionCheckerService;

  const puzzleRepository = {
    findOne: jest.fn(),
  };

  const attemptRepository = {
    create: jest.fn((value) => value),
    save: jest.fn((value) => Promise.resolve(value)),
    count: jest.fn(),
  };

  const rateLimiterService = {
    isRateLimited: jest.fn(),
  };

  const activePuzzle = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    solution: 'Stellar',
    isActive: true,
  } as Puzzle;

  beforeEach(() => {
    jest.clearAllMocks();
    attemptRepository.count.mockResolvedValue(1);
    rateLimiterService.isRateLimited.mockReturnValue(false);

    service = new PuzzleSolutionCheckerService(
      puzzleRepository as any,
      attemptRepository as any,
      rateLimiterService as any,
    );
  });

  it('accepts an answer after deterministic normalisation', async () => {
    puzzleRepository.findOne.mockResolvedValue(activePuzzle);

    const result = await service.checkSolution({
      puzzleId: activePuzzle.id,
      answer: '  STELLAR  ',
    });

    expect(result).toEqual({
      isCorrect: true,
      attempts: 1,
      feedback: 'Correct answer!',
    });
    expect(puzzleRepository.findOne).toHaveBeenCalledWith({
      where: { id: activePuzzle.id, isActive: true },
    });
  });

  it('rejects an incorrect answer', async () => {
    puzzleRepository.findOne.mockResolvedValue(activePuzzle);

    const result = await service.checkSolution({
      puzzleId: activePuzzle.id,
      answer: 'soroban',
    });

    expect(result.isCorrect).toBe(false);
    expect(result.feedback).toBe('Incorrect answer. Try again.');
  });

  it('persists a hash of the attempt instead of the raw answer', async () => {
    puzzleRepository.findOne.mockResolvedValue(activePuzzle);

    await service.checkSolution({
      puzzleId: activePuzzle.id,
      answer: 'stellar',
      playerId: 'player-1',
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    });

    const savedAttempt = attemptRepository.save.mock
      .calls[0][0] as PuzzleAnswerAttempt;

    expect(savedAttempt.answerHash).toMatch(/^[a-f0-9]{64}$/);
    expect(savedAttempt.answerHash).not.toContain('stellar');
    expect(savedAttempt.outcome).toBe(PuzzleCheckOutcome.CORRECT);
    expect(savedAttempt.playerId).toBe('player-1');
    expect(savedAttempt.ipAddress).toBe('127.0.0.1');
    expect(savedAttempt.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('counts attempts for the player and puzzle', async () => {
    puzzleRepository.findOne.mockResolvedValue(activePuzzle);
    attemptRepository.count.mockResolvedValue(3);

    const result = await service.checkSolution({
      puzzleId: activePuzzle.id,
      answer: 'wrong',
      playerId: 'player-1',
    });

    expect(attemptRepository.count).toHaveBeenCalledWith({
      where: { playerId: 'player-1', puzzleId: activePuzzle.id },
    });
    expect(result.attempts).toBe(3);
  });

  it('returns 429, logs the attempt, and skips the puzzle lookup when rate limited', async () => {
    rateLimiterService.isRateLimited.mockReturnValue(true);

    await expect(
      service.checkSolution({
        puzzleId: activePuzzle.id,
        answer: 'stellar',
        playerId: 'player-1',
      }),
    ).rejects.toBeInstanceOf(HttpException);

    expect(puzzleRepository.findOne).not.toHaveBeenCalled();
    expect(attemptRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: PuzzleCheckOutcome.RATE_LIMITED,
      }),
    );
  });

  it('returns 404 and logs the attempt when the puzzle does not exist', async () => {
    puzzleRepository.findOne.mockResolvedValue(null);

    await expect(
      service.checkSolution({
        puzzleId: activePuzzle.id,
        answer: 'stellar',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(attemptRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: PuzzleCheckOutcome.NOT_FOUND,
      }),
    );
  });

  it('uses a per-player and per-puzzle rate limit key', async () => {
    puzzleRepository.findOne.mockResolvedValue(activePuzzle);

    await service.checkSolution({
      puzzleId: activePuzzle.id,
      answer: 'stellar',
      playerId: 'player-1',
    });

    expect(rateLimiterService.isRateLimited).toHaveBeenCalledWith(
      `puzzle-solution:player-1:${activePuzzle.id}`,
      60,
      10,
    );
  });

  it('does not fail the check if attempt logging fails', async () => {
    puzzleRepository.findOne.mockResolvedValue(activePuzzle);
    attemptRepository.save.mockRejectedValueOnce(new Error('database down'));

    const result = await service.checkSolution({
      puzzleId: activePuzzle.id,
      answer: 'stellar',
    });

    expect(result.isCorrect).toBe(true);
    expect(result.attempts).toBe(0);
  });
});
