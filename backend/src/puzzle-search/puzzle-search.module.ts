/**
 * PuzzleSearchModule — Issue #752
 *
 * Registers the full-text puzzle search feature.
 *
 * Usage: import PuzzleSearchModule into AppModule (or a parent feature
 * module) so that GET /api/v1/puzzles/search is exposed.
 *
 * The module relies on the shared TypeORM DataSource that is configured
 * in AppModule via TypeOrmModule.forRootAsync().  It does NOT declare its
 * own forFeature() repositories because the search service issues raw SQL
 * via InjectDataSource for maximum query flexibility.
 */

import { Module } from '@nestjs/common';
import { PuzzleSearchController } from './puzzle-search.controller';
import { PuzzleSearchService } from './puzzle-search.service';

@Module({
  controllers: [PuzzleSearchController],
  providers: [PuzzleSearchService],
  exports: [PuzzleSearchService],
})
export class PuzzleSearchModule {}
