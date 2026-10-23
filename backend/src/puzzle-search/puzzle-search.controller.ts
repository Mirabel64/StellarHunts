/**
 * PuzzleSearchController — Issue #752
 *
 * REST endpoint: GET /api/v1/puzzles/search?q=<query>&limit=<n>&offset=<n>
 *
 * Full-text search over puzzle titles, descriptions, and tags.  Results
 * are relevance-ranked when PostgreSQL tsvector is available; the service
 * degrades gracefully to ILIKE when the index is rebuilding and returns
 * an empty result set with `indexDown: true` when the database is
 * unreachable.
 */

import {
  Controller,
  Get,
  Query,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiProperty,
} from '@nestjs/swagger';
import { PuzzleSearchService, PuzzleSearchResponse } from './puzzle-search.service';

// ─── Response DTO (Swagger only — we return the raw service shape) ────────────

class PuzzleSearchResultDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id: string;

  @ApiProperty({ example: 'What is a Soroban contract?' })
  title: string;

  @ApiProperty({ example: 'A deep dive into the Soroban contract model...' })
  description: string;

  @ApiProperty({ example: 'intermediate', enum: ['easy', 'intermediate', 'hard', 'expert'] })
  difficulty: string;

  @ApiProperty({ example: ['soroban', 'smart-contracts', 'stellar'], type: [String] })
  tags: string[];

  @ApiProperty({
    example: 0.0759,
    required: false,
    description: 'ts_rank relevance score. Present only on full-text hits.',
  })
  rank?: number;

  @ApiProperty({ example: '2024-01-15T12:00:00.000Z' })
  createdAt: Date;
}

class PuzzleSearchResponseDto {
  @ApiProperty({ type: [PuzzleSearchResultDto] })
  results: PuzzleSearchResultDto[];

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 'soroban contract' })
  query: string;

  @ApiProperty({
    example: false,
    description:
      'True when full-text index was unavailable and ILIKE fallback was used.',
  })
  fallback: boolean;

  @ApiProperty({
    example: false,
    description:
      'True when the database was unreachable.  `results` will be empty.',
  })
  indexDown: boolean;
}

// ─── Controller ──────────────────────────────────────────────────────────────

@ApiTags('Puzzle Search')
@Controller('puzzles/search')
export class PuzzleSearchController {
  constructor(private readonly puzzleSearchService: PuzzleSearchService) {}

  /**
   * GET /api/v1/puzzles/search
   *
   * Performs full-text search over active puzzles.
   *
   * Query parameters:
   *   q       — search string (required).  Supports multi-word phrases.
   *   limit   — max results per page (1–100, default 20).
   *   offset  — pagination offset (default 0).
   *
   * The response shape is stable regardless of whether the full-text index
   * is available.  Callers should check `fallback` and `indexDown` to decide
   * whether to show a degraded-search banner.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Full-text search over puzzles',
    description:
      'Searches puzzle titles, descriptions, and tags using PostgreSQL ' +
      'tsvector / tsquery.  Results are relevance-ranked.  Falls back to ' +
      'ILIKE when the index is unavailable and returns an empty set with ' +
      '`indexDown: true` when the database is unreachable.',
  })
  @ApiQuery({
    name: 'q',
    required: true,
    description: 'Search query string.  Supports multi-word phrases.',
    example: 'soroban contract',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Maximum results per page (1–100).  Default 20.',
    example: 20,
    type: Number,
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    description: 'Pagination offset.  Default 0.',
    example: 0,
    type: Number,
  })
  @ApiResponse({
    status: 200,
    description: 'Search results (may be empty when nothing matches or the database is down).',
    type: PuzzleSearchResponseDto,
  })
  async search(
    @Query('q') query: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ): Promise<PuzzleSearchResponse> {
    return this.puzzleSearchService.search(query ?? '', limit, offset);
  }
}
