# ADR-0005: PostgreSQL for Primary Relational Storage

**Date:** 2026-10-19
**Status:** Accepted
**Deciders:** StellarHunts backend team

---

## Context

StellarHunts needs a primary data store for all relational application data:

- **User accounts** — profiles, authentication credentials, wallet addresses
- **Puzzle content** — categories, puzzles, answers (hashed), difficulty tiers
- **Game progress** — per-user puzzle completion, XP, level state
- **Leaderboard data** — aggregated rankings and milestone achievements
- **Referral records** — invite codes, reward ledger, attribution chains
- **Session and analytics events** — timestamped game events and funnel data

The data model is highly relational (foreign keys across six or more entity
types), requires ACID transactions (e.g., awarding XP and recording a puzzle
completion atomically), and benefits from rich query support (leaderboard
aggregations, referral tree traversals).

Candidates evaluated:

| Criterion | PostgreSQL | MySQL / MariaDB | MongoDB | PlanetScale (MySQL) |
|-----------|-----------|-----------------|---------|---------------------|
| ACID transactions | ✅ Full | ✅ Full | ⚠️ Multi-doc (v4+) | ✅ Full |
| JSON / JSONB support | ✅ First-class JSONB | ⚠️ Limited | ✅ Native | ⚠️ Limited |
| Full-text search | ✅ Built-in `tsvector` | ⚠️ Basic | ✅ Atlas Search | ⚠️ Basic |
| TypeORM maturity | ✅ Best-supported | ✅ Good | ✅ Good | ⚠️ Partial |
| Open-source / self-hosted | ✅ | ✅ | ⚠️ SSPL licence | ❌ SaaS |
| Ecosystem & hosting options | ✅ Wide (RDS, Supabase, Render) | ✅ Wide | ��� Atlas | ❌ Limited |
| Team familiarity | High | Medium | Low | Low |

Key requirements that influenced the decision:

- TypeORM is the chosen ORM (established in ADR-0003). PostgreSQL has the
  most mature TypeORM driver and is the reference database in the TypeORM
  documentation.
- The game design involves deeply relational data (user→progress→puzzle→category)
  where JOIN-heavy queries are the norm.
- JSONB is needed for flexible event payload storage in the analytics module
  without a separate document store.
- Self-hosted or managed PostgreSQL is available on every major cloud platform
  (AWS RDS, Google Cloud SQL, Supabase, Render) with no vendor lock-in.

## Decision

StellarHunts uses **PostgreSQL 15+** as the single primary relational database.

- TypeORM manages schema with entity definitions in `backend/src/**/*.entity.ts`.
- `DATABASE_SYNC=true` is permitted in `development` and `test` environments
  for rapid iteration; production uses TypeORM migrations.
- Connection pooling is handled by TypeORM's default pool (pg driver); pool
  size is tunable via `DATABASE_POOL_SIZE` if needed.
- The `backend/.env.example` and `docker-compose.yml` both provision a
  PostgreSQL 15 container for local development.
- Analytics event payloads are stored as JSONB columns, avoiding a second
  document store dependency.

## Consequences

### Positive

- Strongest TypeORM integration of any relational database — entities, relations,
  migrations, and query builder all behave predictably.
- ACID transactions let XP award, progress update, and referral credit be
  committed or rolled back atomically with no saga pattern required.
- JSONB support covers semi-structured analytics events without adding MongoDB.
- Wide hosting ecosystem (Supabase, AWS RDS, Render, self-hosted) with no
  licence restrictions.
- The team has deep familiarity with PostgreSQL; no ramp-up cost.

### Negative / Trade-offs

- Vertical scaling only for a single primary instance; horizontal read scaling
  requires read replicas (connection-string routing not yet implemented).
- Schema migrations must be managed carefully as the product matures; `DATABASE_SYNC`
  is disabled in production precisely to avoid accidental destructive migrations.
- Not a natural fit for document-style data (e.g., deeply nested puzzle metadata);
  any schema evolution in JSONB columns is unvalidated at the database level.
