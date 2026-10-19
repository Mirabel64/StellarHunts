# Running StellarHunts with Docker

This guide explains how to run the full StellarHunts stack locally using
Docker Compose.  One command starts all four services: PostgreSQL, Redis,
the NestJS backend, and the Next.js frontend.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) 24+ (or
  Docker Engine + Docker Compose v2 on Linux)
- 4 GB of available RAM recommended

No Node.js, Rust, or PostgreSQL installation is required on your host machine.

## Quick Start

```bash
# 1. Clone the repository (if you haven't already)
git clone https://github.com/UnityChainxx/StellarHunts.git
cd StellarHunts

# 2. Start all services (builds images on first run)
docker compose up --build

# 3. Open the app
#    Frontend:  http://localhost:3000
#    Backend:   http://localhost:3001
#    API Docs:  http://localhost:3001/api/docs
```

Press `Ctrl+C` to stop.  Data is persisted in Docker volumes across restarts.

## Services

| Service | Image | Internal Port | Host Port |
|---------|-------|---------------|-----------|
| postgres | `postgres:15-alpine` | 5432 | 5432 |
| redis | `redis:7-alpine` | 6379 | 6379 |
| backend | Built from `Dockerfile.backend` | 3001 | 3001 |
| frontend | Built from `Dockerfile.frontend` | 3000 | 3000 |

### Start order

```
postgres ─┐
           ├─(healthy)→ backend ─(healthy)→ frontend
redis    ─┘
```

Each service uses Docker health checks so a dependent service only starts
once its dependency is ready.

## Configuration

Docker Compose reads variables from a `.env` file in the repository root.
Copy and edit the backend example to get started:

```bash
cp backend/.env.example .env
```

Key variables you may want to override:

| Variable | Default (compose) | Notes |
|----------|-------------------|-------|
| `JWT_SECRET` | `change-me-in-production-…` | **Change this.** Generate with `openssl rand -hex 32`. |
| `DATABASE_USER` | `postgres` | PostgreSQL username |
| `DATABASE_PASSWORD` | `postgres` | PostgreSQL password |
| `DATABASE_NAME` | `stellarshunts` | PostgreSQL database name |
| `REDIS_PASSWORD` | `redislocal` | Redis password |
| `STELLAR_MODE` | `mock` | Set to `live` to use real Soroban contracts |
| `STELLAR_NETWORK` | `testnet` | `testnet` or `pubnet` |
| `SOROBAN_RPC_URL` | Testnet public RPC | Only needed in `live` mode |
| `STELLAR_HUNTS_CONTRACT_ID` | *(empty)* | Required in `live` mode |
| `STELLAR_HUNTS_NFT_CONTRACT_ID` | *(empty)* | Required in `live` mode |

> **Note on `STELLAR_MODE`:** The backend schema defaults to `live` (fail-closed
> behaviour — see `backend/src/config/config.validation.ts`).  The Compose file
> sets `STELLAR_MODE=mock` so the stack works out-of-the-box without Soroban
> credentials.  To test against the Stellar testnet, set `STELLAR_MODE=live`
> and supply real contract IDs.

## Common Commands

```bash
# Start in detached (background) mode
docker compose up -d --build

# View logs for all services
docker compose logs -f

# View logs for a specific service
docker compose logs -f backend

# Stop all services (data is preserved)
docker compose stop

# Stop and remove containers (data volumes are preserved)
docker compose down

# Stop, remove containers AND volumes (destroys all data)
docker compose down -v

# Rebuild a single service image
docker compose build backend
docker compose up -d backend

# Open a shell in the running backend container
docker compose exec backend sh

# Run a one-off backend command (e.g., TypeORM migration)
docker compose run --rm backend node dist/database/run-migrations

# Connect to PostgreSQL with psql
docker compose exec postgres psql -U postgres -d stellarshunts
```

## Running in Live Mode (Stellar Testnet)

To connect the backend to real Soroban contracts on the Stellar testnet:

1. Deploy the contracts in `onchain/` to testnet (see `onchain/README.md`).
2. Copy contract IDs from the deployment output.
3. Update your `.env` file:

```env
STELLAR_MODE=live
STELLAR_NETWORK=testnet
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_HUNTS_CONTRACT_ID=<your-game-contract-id>
STELLAR_HUNTS_NFT_CONTRACT_ID=<your-nft-contract-id>
SOROBAN_NFT_CONTRACT_ID=<your-nft-contract-id>
```

4. Restart the backend:

```bash
docker compose up -d --build backend
```

## Production Notes

The Docker setup is designed for local development convenience.  Before
deploying to production, review the following:

- **Secrets**: Replace all default passwords and `JWT_SECRET` with strong,
  randomly generated values.  Use a secrets manager (e.g., AWS Secrets
  Manager, HashiCorp Vault) rather than a `.env` file.
- **DATABASE_SYNC**: Set `DATABASE_SYNC=false` and use TypeORM migrations
  in production.  Auto-sync can drop columns during schema changes.
- **Redis TLS**: Use a `rediss://` URL (TLS) in production.  The default
  compose config uses plain TCP, which is only acceptable on a trusted
  private network.
- **HTTPS**: Terminate TLS at a reverse proxy (nginx, Caddy, AWS ALB) in
  front of both the backend (3001) and frontend (3000).  The frontend HSTS
  header requires HTTPS to be effective.
- **Image tags**: Pin image tags in production (e.g., `postgres:15.6-alpine`)
  instead of minor-version floating tags.

## Dockerfile Overview

### `Dockerfile.backend`

Three-stage build for the NestJS API:

1. **deps** — installs all npm dependencies (including dev) needed to compile.
2. **build** — runs `tsc` / `nest build` and prunes dev dependencies.
3. **runner** — copies only `dist/` and production `node_modules`; runs as a
   non-root `nestjs` user.

### `Dockerfile.frontend`

Three-stage build for the Next.js application:

1. **deps** — installs all npm dependencies.
2. **build** — runs `next build` with `output: 'standalone'` enabled.
3. **runner** — copies the standalone bundle, static assets, and public
   directory; runs as a non-root `nextjs` user.

> **Note:** `next.config.mjs` must include `output: 'standalone'` for the
> frontend Docker image to work correctly.  This is not yet set by default;
> add it when you are ready to containerise the frontend for production.

## Troubleshooting

**Backend fails to start with "missing required env vars"**

The startup validation schema requires `DATABASE_HOST`, `DATABASE_USER`,
`DATABASE_PASSWORD`, `DATABASE_NAME`, and `JWT_SECRET`.  In live mode it also
requires the Soroban contract IDs.  Check your `.env` file or the Compose
environment section.

**Port already in use**

If ports 3000, 3001, 5432, or 6379 are already in use on your machine, edit
the host-side ports in `docker-compose.yml`:

```yaml
ports:
  - "3002:3001"   # map host port 3002 → container port 3001
```

**Database connection refused**

The `backend` service waits for `postgres` to be healthy (via `pg_isready`)
before starting.  If it still fails, increase `start_period` in the backend
health check or check that `DATABASE_PASSWORD` matches what PostgreSQL was
initialised with.

**Rebuild after code changes**

```bash
docker compose up --build
```

For faster iteration during backend development, consider running the backend
natively (`npm run start:dev`) and only using Compose for PostgreSQL and Redis:

```bash
# Start only the infrastructure services
docker compose up -d postgres redis

# Run the backend natively
cd backend && npm run start:dev
```
