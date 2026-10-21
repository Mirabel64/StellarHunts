# StellarHunts — CI/CD Secrets Inventory

> **Audience:** Platform engineers, DevOps, and security reviewers.  
> **Last reviewed:** 2026-10-19  
> **Review cadence:** Every 90 days or after any security incident.

---

## Table of Contents

1. [Overview](#overview)
2. [Secrets Reference Table](#secrets-reference-table)
3. [Required vs Optional Matrix](#required-vs-optional-matrix)
4. [Rotation Schedule](#rotation-schedule)
5. [How to Rotate Each Secret](#how-to-rotate-each-secret)
6. [Enabling Dependabot](#enabling-dependabot)
7. [Enabling Secret Scanning](#enabling-secret-scanning)
8. [Least-Privilege PAT Scopes](#least-privilege-pat-scopes)
9. [Revocation Checklist](#revocation-checklist)

---

## Overview

StellarHunts uses GitHub Actions for CI/CD. Secrets are stored in the repository
or organisation-level **Settings → Secrets and variables → Actions** panel and
are never logged or exposed in workflow output.

All secrets follow the principle of **least privilege**: each token or credential
carries only the permissions required for its specific job. Unused secrets **must**
be deleted immediately.

---

## Secrets Reference Table

| Secret name | Category | Purpose | Scope / Used by | Required |
|---|---|---|---|---|
| `JWT_SECRET` | Auth | Signs and verifies JWTs issued by the NestJS auth service | Backend API process | ✅ Required |
| `JWT_REFRESH_SECRET` | Auth | Signs refresh-token JWTs (longer-lived, separate signing key) | Backend API process | ✅ Required |
| `DATABASE_HOST` | Database | PostgreSQL server hostname or IP | Backend API, E2E tests | ✅ Required |
| `DATABASE_PORT` | Database | PostgreSQL listening port (default 5432) | Backend API, E2E tests | ✅ Required |
| `DATABASE_USER` | Database | PostgreSQL role / username | Backend API, E2E tests | ✅ Required |
| `DATABASE_PASSWORD` | Database | PostgreSQL role password | Backend API, E2E tests | ✅ Required |
| `DATABASE_NAME` | Database | Name of the PostgreSQL database | Backend API, E2E tests | ✅ Required |
| `STELLAR_HUNTS_CONTRACT_ID` | Blockchain | Deployed StellarHunts game contract address on Soroban | Backend Stellar service | ✅ Required (live mode) |
| `STELLAR_HUNTS_NFT_CONTRACT_ID` | Blockchain | Deployed NFT badge contract address on Soroban | Backend NFT reward service | ✅ Required (live mode) |
| `SOROBAN_RPC_URL` | Blockchain | Soroban JSON-RPC endpoint URL | Backend Stellar service | ✅ Required (live mode) |
| `STELLAR_NETWORK` | Blockchain | Target network: `testnet` or `pubnet` | Backend Stellar service | ✅ Required |
| `STELLAR_SOURCE_SECRET_KEY` | Blockchain | Stellar keypair secret for signing fee-bump/admin transactions | Backend Stellar service | ✅ Required (live mode) |
| `REDIS_HOST` | Cache / Queue | Redis server hostname | Backend workers, Socket.IO adapter | ✅ Required |
| `REDIS_PORT` | Cache / Queue | Redis listening port (default 6379) | Backend workers, Socket.IO adapter | ✅ Required |
| `REDIS_PASSWORD` | Cache / Queue | Redis AUTH password | Backend workers, Socket.IO adapter | ⚠️ Required if Redis AUTH enabled |
| `REDIS_TLS` | Cache / Queue | Set to `true` to enable TLS for Redis connections | Backend workers | Optional |
| `NEXT_PUBLIC_SOROBAN_RPC_URL` | Frontend config | Public Soroban RPC URL exposed to browser bundle | Frontend Next.js build | Optional |
| `NEXT_PUBLIC_STELLAR_HUNTS_CONTRACT_ID` | Frontend config | Public game contract ID exposed to browser bundle | Frontend Next.js build | Optional |
| `NEXT_PUBLIC_STELLAR_HUNTS_NFT_CONTRACT_ID` | Frontend config | Public NFT contract ID exposed to browser bundle | Frontend Next.js build | Optional |
| `SMTP_HOST` | Email | Mail server hostname for transactional emails | Backend email service | Optional |
| `SMTP_PORT` | Email | Mail server port (usually 587 TLS or 465 SSL) | Backend email service | Optional |
| `SMTP_USER` | Email | SMTP authentication username | Backend email service | Optional |
| `SMTP_PASSWORD` | Email | SMTP authentication password | Backend email service | Optional |
| `STRIPE_SECRET_KEY` | Payments | Stripe secret API key for payment processing | Backend payments service | Optional |
| `STRIPE_WEBHOOK_SECRET` | Payments | Stripe webhook signing secret for event verification | Backend payments webhook | Optional |
| `AWS_ACCESS_KEY_ID` | AWS | AWS IAM access key for S3/CloudFront asset uploads | CI deploy job | Optional |
| `AWS_SECRET_ACCESS_KEY` | AWS | AWS IAM secret key (companion to `AWS_ACCESS_KEY_ID`) | CI deploy job | Optional |
| `AWS_REGION` | AWS | AWS region for S3 bucket and other services | CI deploy job | Optional |
| `GH_ACTIONS_PAT` | CI | GitHub Personal Access Token for cross-repo workflows (read packages, create releases) | CI workflows | Optional |
| `DOCKER_HUB_USERNAME` | Container registry | Docker Hub username for pushing images | CI build/push job | Optional |
| `DOCKER_HUB_TOKEN` | Container registry | Docker Hub access token (not password) | CI build/push job | Optional |
| `CODECOV_TOKEN` | Observability | Codecov upload token for coverage reports | CI test jobs | Optional |
| `SENTRY_DSN` | Observability | Sentry project DSN for error reporting | Backend & Frontend | Optional |
| `SENTRY_AUTH_TOKEN` | Observability | Sentry auth token for source map uploads | CI deploy job | Optional |

---

## Required vs Optional Matrix

### Always required (app will not start without these)

```
JWT_SECRET
JWT_REFRESH_SECRET
DATABASE_HOST, DATABASE_PORT, DATABASE_USER, DATABASE_PASSWORD, DATABASE_NAME
STELLAR_NETWORK
REDIS_HOST, REDIS_PORT
```

### Required only when `STELLAR_MODE=live`

```
STELLAR_HUNTS_CONTRACT_ID
STELLAR_HUNTS_NFT_CONTRACT_ID
SOROBAN_RPC_URL
STELLAR_SOURCE_SECRET_KEY
```

### Optional (feature-gated)

All remaining secrets are only needed when their associated feature is active.
Setting `STELLAR_MODE=mock` (default for local development) allows the backend
to start without any Stellar/Soroban credentials.

---

## Rotation Schedule

| Category | Rotation interval | Rationale |
|---|---|---|
| JWT signing secrets (`JWT_SECRET`, `JWT_REFRESH_SECRET`) | **30 days** | Short-lived; compromised tokens grant auth bypass |
| Database passwords | **90 days** | Stored credential; rotate on any suspected exposure |
| Stellar keypair secret (`STELLAR_SOURCE_SECRET_KEY`) | **90 days** | On-chain consequences; high impact if leaked |
| Soroban RPC URL / contract IDs | On contract redeployment | These change only when contracts are redeployed |
| API keys (Stripe, Sentry, Codecov, Docker Hub) | **90 days** | Industry standard for third-party API keys |
| AWS IAM credentials | **90 days** | Use short-lived OIDC tokens in CI where possible |
| GitHub PATs (`GH_ACTIONS_PAT`) | **90 days** | Scope to minimum; prefer GitHub Apps over PATs |
| SMTP credentials | **180 days** | Low blast radius; still rotate periodically |

> **Automated rotation:** Where the provider supports it (AWS IAM via OIDC,
> GitHub OIDC, Stripe restricted keys), prefer token-based federation over
> long-lived secrets entirely.

---

## How to Rotate Each Secret

### JWT secrets (`JWT_SECRET`, `JWT_REFRESH_SECRET`)

1. Generate a new secret:
   ```bash
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```
2. Update the secret in **GitHub → Settings → Secrets and variables → Actions**.
3. Redeploy the backend. Active sessions will be invalidated; users must re-login.
4. Delete the old value from any `.env` files or secret managers.

### Database password (`DATABASE_PASSWORD`)

1. Generate a new password:
   ```bash
   openssl rand -base64 32
   ```
2. Update the password in PostgreSQL:
   ```sql
   ALTER USER stellarhunts_user WITH PASSWORD 'new-password';
   ```
3. Update `DATABASE_PASSWORD` in GitHub Secrets and all deployment environments.
4. Redeploy the backend (new connections will use the new password).

### Stellar keypair (`STELLAR_SOURCE_SECRET_KEY`)

1. Generate a new Stellar keypair using the Stellar CLI or SDK:
   ```bash
   stellar keys generate --network testnet new-admin-key
   stellar keys show new-admin-key
   ```
2. Fund the new account on the target network (testnet friendbot or pubnet XLM).
3. Transfer any relevant on-chain permissions/roles to the new keypair.
4. Update `STELLAR_SOURCE_SECRET_KEY` in GitHub Secrets.
5. Redeploy the backend.
6. After confirming the new key works, remove the old keypair's signing authority.

### AWS IAM credentials

1. In the AWS Console, go to **IAM → Users → stellarhunts-ci → Security credentials**.
2. Create a new access key pair.
3. Update `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in GitHub Secrets.
4. Run a CI job to verify the new credentials work.
5. Deactivate (then delete after 24 h) the old access key.
6. **Preferred alternative:** Configure [OIDC federation](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services) to eliminate long-lived keys entirely.

### Docker Hub token (`DOCKER_HUB_TOKEN`)

1. Log into Docker Hub → **Account Settings → Security → Access Tokens**.
2. Create a new token with **Read, Write, Delete** scope (or narrower if possible).
3. Update `DOCKER_HUB_TOKEN` in GitHub Secrets.
4. Revoke the old token.

### GitHub PAT (`GH_ACTIONS_PAT`)

1. Go to **GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens**.
2. Create a new token scoped to only the required repositories and permissions (see [Least-Privilege PAT Scopes](#least-privilege-pat-scopes)).
3. Update `GH_ACTIONS_PAT` in GitHub Secrets.
4. Delete the old token immediately.

### Stripe keys

1. Log into Stripe Dashboard → **Developers → API keys**.
2. Roll the secret key (Stripe creates a new key and keeps the old one active briefly).
3. Update `STRIPE_SECRET_KEY` in GitHub Secrets.
4. Redeploy the backend.
5. For the webhook secret, update the endpoint in Stripe Dashboard and copy the new signing secret to `STRIPE_WEBHOOK_SECRET`.

### Redis password

1. Update the `requirepass` directive in your Redis config (or managed Redis provider settings).
2. Update `REDIS_PASSWORD` in GitHub Secrets.
3. Redeploy the backend workers.

---

## Enabling Dependabot

Dependabot is already configured via `.github/dependabot.yml` covering:
- **npm** (root, `/frontend`, `/backend`)
- **cargo** (`/onchain` Rust workspace)
- **github-actions** (workflow dependencies)

To verify and enable:

1. Go to **Repository → Settings → Code security and analysis**.
2. Under **Dependabot**, enable:
   - **Dependabot alerts** — notifies on known vulnerabilities in dependencies.
   - **Dependabot security updates** — auto-opens PRs to fix vulnerable dependencies.
   - **Dependabot version updates** — governed by `.github/dependabot.yml`.
3. Confirm that `GITHUB_TOKEN` has write access to create PRs (default for public repos; check branch protection rules for private repos).

To add Docker image scanning, add the following block to `.github/dependabot.yml`:

```yaml
  - package-ecosystem: "docker"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
    commit-message:
      prefix: "chore(deps/docker)"
    labels:
      - "dependencies"
      - "docker"
    open-pull-requests-limit: 3
```

---

## Enabling Secret Scanning

GitHub Secret Scanning automatically detects accidentally committed secrets.

1. Go to **Repository → Settings → Code security and analysis**.
2. Enable **Secret scanning** — scans all commits and open issues/PRs.
3. Enable **Push protection** — blocks pushes that contain detected secrets.
4. Optionally configure **Secret scanning patterns** if you use custom secret formats.

For the Stellar keypair format (`S...` 56-character base32 strings), add a
custom pattern under **Settings → Code security → Secret scanning → Custom patterns**:

```regex
S[A-Z2-7]{55}
```

### Responding to secret scanning alerts

1. Go to **Security → Secret scanning alerts**.
2. For each alert: revoke the leaked secret immediately, generate a new one, update GitHub Secrets.
3. Mark the alert as resolved with the resolution reason.
4. If the secret was in a public commit, assume it is compromised regardless of exposure window.

---

## Least-Privilege PAT Scopes

If a GitHub PAT is required for cross-repo workflows, use **Fine-grained tokens** with:

| Permission | Level | Reason |
|---|---|---|
| Contents | Read | Read source for release notes |
| Actions | Read | Trigger / monitor workflow runs |
| Packages | Read/Write | Push/pull GitHub Container Registry images |
| Pull requests | Write | Create release PRs |
| Metadata | Read | Required for all fine-grained tokens |

Do **not** grant:
- Admin permissions
- `delete` on any resource unless explicitly required
- Access to repositories outside the StellarHunts org

---

## Revocation Checklist

Run this checklist whenever a developer leaves the project, a secret is suspected
compromised, or a production incident occurs:

- [ ] Rotate all JWT secrets and force re-login for all users
- [ ] Rotate all database passwords
- [ ] Rotate the Stellar source keypair and reassign on-chain roles
- [ ] Revoke and regenerate all third-party API keys (Stripe, Sentry, Codecov)
- [ ] Rotate AWS IAM credentials or disable OIDC federation for the affected role
- [ ] Revoke Docker Hub tokens and create new ones
- [ ] Delete and recreate all GitHub PATs for CI
- [ ] Review and audit all recent CI workflow runs for secret leakage
- [ ] Check GitHub Secret Scanning alerts for any auto-detected leaks
- [ ] Notify the security team and document the incident in the incident log
