# ADR-0006: Soroban Event Indexing Strategy

**Date:** 2026-10-19
**Status:** Accepted
**Deciders:** StellarHunts core team

---

## Context

Soroban smart contracts emit events — structured log entries that record
state transitions (puzzle completed, badge minted, level advanced).  The
StellarHunts frontend and leaderboard need to reflect on-chain state in
near-real-time, which means the backend must consume those events reliably.

Approaches considered:

### Option A — Query on demand (no indexer)

Every API request that needs on-chain state calls `getEvents` on the Soroban
RPC, filters the result set, and returns the answer.

**Problems:**
- `getEvents` is paginated and scoped to a ledger window. Reconstructing full
  history (e.g., "which badges does this user hold?") requires multiple round
  trips and grows in cost over time.
- Soroban RPC nodes prune historical events after a configurable archival
  window; relying on them for authoritative state means old data may disappear.
- No caching layer means every request hits the RPC, which has rate limits on
  public nodes.

### Option B — Backend polling indexer (chosen)

A dedicated NestJS scheduled task (`@nestjs/schedule` cron) polls
`getEvents` periodically, stores each event in PostgreSQL
(`onchain_events` table), and keeps a `last_ledger_cursor` so it never
double-processes a ledger.

**Properties:**
- Events are stored durably in PostgreSQL; no data loss even if the RPC node
  prunes history.
- API queries are served from the local database — low latency, no RPC
  dependency at read time.
- The indexer can be replayed from the contract's genesis ledger to rebuild
  state from scratch.
- `STELLAR_MODE=mock` bypasses the indexer entirely, keeping local development
  free of network dependencies.

### Option C — Third-party indexer (Blockdaemon, Cheesecake Labs, etc.)

Delegate event indexing to a managed service that exposes a REST or GraphQL API.

**Problems:**
- Introduces an external SaaS dependency (availability, cost, data ownership).
- Soroban indexing services were not mature enough at the time of this decision
  for the Stellar testnet contract IDs we use.
- Harder to run locally; adds friction for contributors.

## Decision

StellarHunts uses an **in-process backend polling indexer** (Option B).

Implementation details:

- A `SorobanIndexerService` in `backend/src/rewards/` runs as a cron job
  (interval configurable; default 6 seconds in development, 15 seconds in
  production).
- It calls `server.getEvents({ startLedger, filters: [{ contractIds: [...] }] })`
  using `@stellar/stellar-sdk`.
- Each new event is upserted into the `onchain_events` table keyed on
  `(contract_id, ledger_sequence, event_index)` — making ingestion idempotent.
- A `cursor` row in the `indexer_state` table persists the last processed
  ledger so the job resumes correctly after a restart.
- When `STELLAR_MODE=mock`, the cron job is not registered, so no Soroban RPC
  calls are made during local development or CI.
- `SOROBAN_RPC_URL` is required in `live` mode (enforced by the startup
  validation schema, see `backend/src/config/config.validation.ts`).

## Consequences

### Positive

- All on-chain reads served from PostgreSQL — consistent latency, no RPC
  dependency at query time.
- Event history is preserved in the application database regardless of RPC
  node pruning policies.
- Idempotent upsert allows the indexer to be safely restarted or replayed
  without duplicating data.
- `STELLAR_MODE=mock` keeps the indexer out of the critical path for
  development and test environments.
- No external dependency; the indexer runs inside the existing NestJS process,
  reducing operational complexity consistent with ADR-0003 (modular monolith).

### Negative / Trade-offs

- Polling introduces latency (up to one polling interval) between on-chain
  finality and UI reflection; this is acceptable for a game but would not suit
  high-frequency financial applications.
- The NestJS process is responsible for keeping the cursor up to date; if the
  process is down for an extended period, it will need to catch up by replaying
  ledgers, which creates a temporary spike in RPC calls.
- Soroban `getEvents` has a maximum ledger-range per call; the indexer must
  paginate correctly to avoid gaps when catching up after downtime.
- A single polling loop does not scale horizontally without a distributed lock
  (e.g., a Redis-backed leader-election); this is a known limitation to address
  before running multiple backend replicas at high write volume.
