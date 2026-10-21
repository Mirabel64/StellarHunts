# ADR-0007: Redis Caching Layer

**Date:** 2026-10-19
**Status:** Accepted
**Deciders:** StellarHunts backend team

---

## Context

StellarHunts has three components that independently benefit from an in-memory
data structure store:

1. **Socket.IO horizontal scaling** — Socket.IO requires a shared pub/sub
   adapter when the NestJS server runs as multiple replicas behind a load
   balancer. Without it, a socket connected to replica A cannot receive events
   emitted on replica B.

2. **API response caching** — Leaderboard rankings, puzzle category lists, and
   referral stats are read-heavy and change infrequently. Computing them from
   PostgreSQL on every request wastes CPU and database connections.

3. **Rate limiting** — The `/auth/*` and `/puzzle/submit` endpoints need
   distributed rate limiting. Per-process counters would not enforce limits
   across replicas.

Alternatives considered:

| Option | Socket.IO adapter | API caching | Rate limiting | Notes |
|--------|------------------|-------------|---------------|-------|
| Redis | ✅ `@socket.io/redis-adapter` | ✅ `cache-manager-ioredis` | ✅ `@nestjs/throttler` + Redis store | All three in one service |
| Memcached | ❌ No Socket.IO adapter | ✅ | ✅ (limited) | Cannot serve the socket use case |
| In-process Map | ❌ | ⚠️ Single-replica only | ❌ | Does not work across replicas |
| Valkey (Redis fork) | ✅ Compatible | ✅ | ✅ | Considered; Redis still preferred for ecosystem |

Redis uniquely satisfies all three requirements with a single dependency.  The
team already had Redis operational experience from prior projects, reducing
ramp-up time.

The application is designed to **degrade gracefully** when Redis is unavailable:
- Socket.IO falls back to in-memory adapter (single-instance only).
- Cache misses fall through to PostgreSQL.
- Rate limiting falls back to the in-process throttler.

This behaviour is enforced by checking whether `REDIS_URL` / `REDIS_HOST` is
set at startup rather than failing closed, so a developer without a local Redis
instance can still run the backend.

## Decision

StellarHunts uses **Redis 7+** as the shared caching, pub/sub, and rate-limiting
store.

- **Socket.IO adapter**: `@socket.io/redis-adapter` is configured in
  `backend/src/gateway/` when Redis is available.
- **API caching**: `@nestjs/cache-manager` with `cache-manager-ioredis` wraps
  expensive PostgreSQL queries (leaderboard, category list). TTLs are set
  per-endpoint in the service layer.
- **Rate limiting**: `@nestjs/throttler` with a Redis store limits auth and
  puzzle-submission endpoints across all replicas.
- **Configuration**: Redis connection is configured via `REDIS_URL` (preferred)
  or the individual `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` / `REDIS_DB`
  variables — all documented in `backend/.env.example` and validated by the
  startup schema.
- **Local development**: `docker-compose.yml` provisions a Redis 7 container
  (`redis:7-alpine`) so contributors do not need a separate Redis installation.
- **Graceful degradation**: A `RedisHealthIndicator` in the health module
  reports degraded (not down) status when Redis is unreachable, so the
  `/health` endpoint correctly distinguishes a hard failure from a soft one.

## Consequences

### Positive

- Single dependency satisfies Socket.IO scaling, caching, and rate limiting —
  no Memcached + Redis split.
- Leaderboard and category endpoints become O(1) cache reads for the majority
  of traffic; PostgreSQL load is reduced significantly.
- Distributed rate limiting prevents auth brute-force across all replicas.
- `redis:7-alpine` in `docker-compose.yml` gives every contributor a consistent
  local Redis with one command.
- Graceful degradation means the backend remains functional (with reduced
  performance) during a Redis outage, acceptable for a game product.

### Negative / Trade-offs

- Adds an operational dependency; Redis must be provisioned and monitored in
  every deployment environment.
- Cache invalidation is manual — services must explicitly evict or update cache
  entries when underlying data changes (e.g., after a puzzle is completed).
  Stale cache bugs can surface if invalidation logic is missed.
- Redis data is ephemeral by default; rate-limit counters and cached data are
  lost on restart. For rate limiting this is acceptable (short windows); for
  caching it is a feature (cache is warm again within one polling cycle).
- Running Redis without a password (`REDIS_PASSWORD` left empty) is acceptable
  only in local development; production deployments must set a strong password
  and use TLS (`rediss://`).
