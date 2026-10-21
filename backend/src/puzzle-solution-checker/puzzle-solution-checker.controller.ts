import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { CheckSolutionDto } from './dto/check-solution.dto';
import {
  CheckSolutionResult,
  PuzzleSolutionCheckerService,
  SOLUTION_CHECK_RATE_LIMIT_MAX_ATTEMPTS,
  SOLUTION_CHECK_RATE_LIMIT_TTL_SECONDS,
} from './puzzle-solution-checker.service';
import { RateLimit } from '../rate-limiter/rate-limit.decorator';
import { RateLimitGuard } from '../rate-limiter/rate-limit.guard';

@ApiTags('Puzzle Solution')
@Controller('puzzle-solution')
export class PuzzleSolutionCheckerController {
  constructor(
    private readonly solutionChecker: PuzzleSolutionCheckerService,
  ) {}

  @Post('check')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @RateLimit({
    ttl: SOLUTION_CHECK_RATE_LIMIT_TTL_SECONDS,
    limit: SOLUTION_CHECK_RATE_LIMIT_MAX_ATTEMPTS,
  })
  @ApiOperation({
    summary: 'Check an off-chain puzzle answer',
    description:
      'Deterministically checks a submitted answer against the server-side puzzle solution before on-chain submission.',
  })
  @ApiResponse({
    status: 200,
    description: 'Answer checked successfully.',
    schema: {
      type: 'object',
      properties: {
        isCorrect: { type: 'boolean' },
        attempts: { type: 'number' },
        feedback: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Puzzle not found.' })
  @ApiResponse({
    status: 429,
    description: 'Too many solution checks for this player or IP.',
  })
  check(
    @Body() dto: CheckSolutionDto,
    @Req() request: Request,
  ): Promise<CheckSolutionResult> {
    const authenticatedUserId = (request as Request & {
      user?: { id?: string };
    }).user?.id;

    return this.solutionChecker.checkSolution({
      puzzleId: dto.puzzleId,
      answer: dto.answer,
      playerId: dto.playerId ?? authenticatedUserId,
      ipAddress: request.ip,
      userAgent: request.get('user-agent') ?? undefined,
    });
  }
}
