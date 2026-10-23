# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the
StellarHunts project.  ADRs capture significant architectural and design
decisions — including the context that drove them, the decision itself, and
the trade-offs accepted.

See [ADR-0001](0001-record-architecture-decisions.md) for the process and
template used to write new ADRs.

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [0001](0001-record-architecture-decisions.md) | Record Architecture Decisions | Accepted |
| [0002](0002-zustand-alongside-redux-toolkit.md) | Use Zustand as the Primary State Manager Alongside Redux Toolkit | Accepted |
| [0003](0003-nestjs-modular-monolith.md) | NestJS Modular Monolith Over Microservices | Accepted |
| [0004](0004-soroban-over-evm.md) | Use Soroban (Stellar) Over EVM-Compatible Chains | Accepted |
| [0005](0005-postgresql-for-primary-storage.md) | PostgreSQL for Primary Relational Storage | Accepted |
| [0006](0006-soroban-event-indexing-strategy.md) | Soroban Event Indexing Strategy | Accepted |
| [0007](0007-redis-caching-layer.md) | Redis Caching Layer | Accepted |

## Writing a New ADR

1. Copy the template from ADR-0001.
2. Name the file `NNNN-short-kebab-case-title.md` where `NNNN` is the next
   sequential number.
3. Fill in all sections.
4. Add a row to the table above.
5. Submit as part of the PR that introduces the change, or as a standalone
   documentation PR if the decision was made informally.

ADRs are **immutable once accepted**.  To reverse or supersede a decision,
create a new ADR and update the `Status` field of the old one to
`Superseded by ADR-XXXX`.
