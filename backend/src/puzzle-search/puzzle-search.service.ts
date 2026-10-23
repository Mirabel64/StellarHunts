/**
 * PuzzleSearchService — Issue #752
 *
 * Full-text search over puzzle titles, descriptions, and tags using
 * PostgreSQL tsvector / tsquery.  Relevance-ranked results are returned
 * via ts_rank so the most relevant puzzles appear first.
 *
 * Features:
 *   - tsvector index updated automatically on INSERT / UPDATE via a
 *     PostgreSQL trigger (see the migration snippet at the bottom of
 *     this file and onchain/docs/storage-versioning.md for the policy).
 *   - Fallback to ILIKE when the full-text index is unavailable (e.g.
 *     during index rebuild or after a connection failure) so the
 *     endpoint always returns results rather than a 500.
 *   - Graceful degradation: if the database itself is unreachable the
 *     service returns an empty result set with `indexDown: true` so the
 *     caller can surface a "search unavailable" banner instead of an
 *     error page.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

// ─── DTOs ────────────────────────────────────────────────────────────────────

export interface PuzzleSearchResult {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  tags: string[];
  /** ts_rank score (higher = more relevant). Present only on full-text hits. */
  rank?: number;
  createdAt: Date;
}

export interface PuzzleSearchResponse {
  results: PuzzleSearchResult[];
  total: number;
  query: string;
  /** True when the full-text index was unavailable and ILIKE fallback was used. */
  fallback: boolean;
  /** True when the database was unreachable.  `results` will be empty. */
  indexDown: boolean;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class PuzzleSearchService {
  private readonly logger = new Logger(PuzzleSearchService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Search for active puzzles matching `query`.
   *
   * Strategy:
   *   1. Try PostgreSQL full-text search (to_tsquery / ts_rank).
   *   2. If that throws (e.g. `search_vector` column absent or index
   *      corrupted) fall back to a plain ILIKE query.
   *   3. If the database itself is unreachable return the empty fallback
   *      response with `indexDown: true`.
   *
   * @param query   Raw search string entered by the user.
   * @param limit   Maximum number of results (default 20, max 100).
   * @param offset  Pagination offset (default 0).
   */
  async search(
    query: string,
    limit = 20,
    offset = 0,
  ): Promise<PuzzleSearchResponse> {
    const safeLimit = Math.min(Math.max(1, Number(limit) || 20), 100);
    const safeOffset = Math.max(0, Number(offset) || 0);
    const trimmed = (query ?? '').trim();

    if (!trimmed) {
      return this.emptyResponse(trimmed, false, false);
    }

    // ── Attempt 1: full-text search ──────────────────────────────────
    try {
      return await this.fullTextSearch(trimmed, safeLimit, safeOffset);
    } catch (ftErr) {
      this.logger.warn(
        `Full-text search failed (will fall back to ILIKE): ${(ftErr as Error).message}`,
      );
    }

    // ── Attempt 2: ILIKE fallback ────────────────────────────────────
    try {
      return await this.ilikeSearch(trimmed, safeLimit, safeOffset);
    } catch (ilikeErr) {
      this.logger.error(
        `ILIKE fallback also failed — database may be down: ${(ilikeErr as Error).message}`,
      );
    }

    // ── Attempt 3: database unreachable ──────────────────────────────
    return this.emptyResponse(trimmed, false, true);
  }

  // ─── Full-text search ───────────────────────────────────────────────

  private async fullTextSearch(
    query: string,
    limit: number,
    offset: number,
  ): Promise<PuzzleSearchResponse> {
    // Convert the user's query to a web-search style tsquery so that
    // phrases like "smart contract" work naturally.  to_tsquery would
    // reject bare strings; websearch_to_tsquery (PG 11+) is more lenient.
    const sql = `
      SELECT
        p.id,
        p.title,
        p.description,
        p.difficulty,
        COALESCE(p.tags, '{}')  AS tags,
        p."createdAt",
        ts_rank(
          to_tsvector('english', p.title || ' ' || p.description || ' ' || COALESCE(array_to_string(p.tags, ' '), '')),
          websearch_to_tsquery('english', $1)
        ) AS rank
      FROM puzzles p
      WHERE
        p."isActive" = true
        AND to_tsvector('english', p.title || ' ' || p.description || ' ' || COALESCE(array_to_string(p.tags, ' '), ''))
            @@ websearch_to_tsquery('english', $1)
      ORDER BY rank DESC, p."createdAt" DESC
      LIMIT  $2
      OFFSET $3
    `;

    const countSql = `
      SELECT COUNT(*) AS total
      FROM puzzles p
      WHERE
        p."isActive" = true
        AND to_tsvector('english', p.title || ' ' || p.description || ' ' || COALESCE(array_to_string(p.tags, ' '), ''))
            @@ websearch_to_tsquery('english', $1)
    `;

    const [rows, [{ total }]] = await Promise.all([
      this.dataSource.query(sql, [query, limit, offset]),
      this.dataSource.query(countSql, [query]),
    ]);

    return {
      results: rows.map(this.mapRow),
      total: Number(total),
      query,
      fallback: false,
      indexDown: false,
    };
  }

  // ─── ILIKE fallback ─────────────────────────────────────────────────

  private async ilikeSearch(
    query: string,
    limit: number,
    offset: number,
  ): Promise<PuzzleSearchResponse> {
    const pattern = `%${query}%`;

    const sql = `
      SELECT
        p.id,
        p.title,
        p.description,
        p.difficulty,
        COALESCE(p.tags, '{}') AS tags,
        p."createdAt"
      FROM puzzles p
      WHERE
        p."isActive" = true
        AND (
          p.title       ILIKE $1
          OR p.description ILIKE $1
          OR EXISTS (
            SELECT 1 FROM unnest(COALESCE(p.tags, '{}')) AS tag
            WHERE tag ILIKE $1
          )
        )
      ORDER BY p."createdAt" DESC
      LIMIT  $2
      OFFSET $3
    `;

    const countSql = `
      SELECT COUNT(*) AS total
      FROM puzzles p
      WHERE
        p."isActive" = true
        AND (
          p.title       ILIKE $1
          OR p.description ILIKE $1
          OR EXISTS (
            SELECT 1 FROM unnest(COALESCE(p.tags, '{}')) AS tag
            WHERE tag ILIKE $1
          )
        )
    `;

    const [rows, [{ total }]] = await Promise.all([
      this.dataSource.query(sql, [pattern, limit, offset]),
      this.dataSource.query(countSql, [pattern]),
    ]);

    this.logger.warn(`Serving ILIKE fallback results for query: "${query}"`);

    return {
      results: rows.map(this.mapRow),
      total: Number(total),
      query,
      fallback: true,
      indexDown: false,
    };
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  private mapRow(row: Record<string, any>): PuzzleSearchResult {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      difficulty: row.difficulty,
      tags: Array.isArray(row.tags) ? row.tags : [],
      rank: row.rank !== undefined ? Number(row.rank) : undefined,
      createdAt: row.createdAt,
    };
  }

  private emptyResponse(
    query: string,
    fallback: boolean,
    indexDown: boolean,
  ): PuzzleSearchResponse {
    return { results: [], total: 0, query, fallback, indexDown };
  }
}

/*
 * ── Recommended migration ────────────────────────────────────────────────────
 *
 * Add a GIN index and an update trigger so the tsvector is maintained
 * automatically.  Run this once after deploying the search module.
 *
 * -- 1. Add the pre-computed search_vector column
 * ALTER TABLE puzzles
 *   ADD COLUMN IF NOT EXISTS search_vector tsvector;
 *
 * -- 2. Back-fill existing rows
 * UPDATE puzzles
 * SET search_vector =
 *   to_tsvector(
 *     'english',
 *     title || ' ' || description || ' ' ||
 *     COALESCE(array_to_string(tags, ' '), '')
 *   );
 *
 * -- 3. Create a GIN index for fast lookups
 * CREATE INDEX IF NOT EXISTS idx_puzzles_search_vector
 *   ON puzzles USING GIN (search_vector);
 *
 * -- 4. Create a trigger to keep search_vector current on INSERT/UPDATE
 * CREATE OR REPLACE FUNCTION puzzles_search_vector_update() RETURNS trigger AS $$
 * BEGIN
 *   NEW.search_vector :=
 *     to_tsvector(
 *       'english',
 *       NEW.title || ' ' || NEW.description || ' ' ||
 *       COALESCE(array_to_string(NEW.tags, ' '), '')
 *     );
 *   RETURN NEW;
 * END;
 * $$ LANGUAGE plpgsql;
 *
 * DROP TRIGGER IF EXISTS trig_puzzles_search_vector ON puzzles;
 * CREATE TRIGGER trig_puzzles_search_vector
 *   BEFORE INSERT OR UPDATE ON puzzles
 *   FOR EACH ROW EXECUTE FUNCTION puzzles_search_vector_update();
 *
 * ── Once the column and trigger exist, replace the inline to_tsvector()
 *    calls in this service with `p.search_vector` for better performance.
 */
