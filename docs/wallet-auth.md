# Wallet signature authentication

StellarHunts supports password login and Stellar wallet login. Wallet login
proves ownership of an ed25519 account key by signing a server-issued
challenge; no private key or seed ever reaches the API.

All routes are under the versioned prefix (`/api/v1` by default).

## Flow

```
wallet                          backend
  │  POST /wallet/challenge      │  generate nonce + message, persist with expiry
  │ ────────────────────────────►│
  │  { nonce, message, expiresAt }│
  │ ◄────────────────────────────│
  │                              │
  │  sign(message) with wallet   │
  │  POST /wallet/verify         │  verify ed25519 signature,
  │  { walletAddress, nonce,     │  atomically consume nonce,
  │    signature }               │  issue session
  │ ────────────────────────────►│
  │  { accessToken, tokenType }  │
  │ ◄────────────────────────────│
```

### 1. Request a challenge

`POST /wallet/challenge`

```json
{ "walletAddress": "GDN752Q6GWGMEEDZOL7DACRHE2QMCD55MILMLRPMZDCN2AOKB6WUOH2G" }
```

```json
{
  "nonce": "9f2c…",
  "message": "stellar-hunts: authenticate\nwallet=G…\nnonce=9f2c…\ndomain=stellar-hunts.app\nexpires=2026-10-18T12:05:00.000Z",
  "expiresAt": "2026-10-18T12:05:00.000Z",
  "domain": "stellar-hunts.app"
}
```

Sign the **exact UTF-8 bytes** of `message`. Wallets that sign a human-readable
message (for example Freighter's `signMessage`) produce this signature
directly.

The lifetime defaults to 300 seconds and is capped at 900 seconds. The
challenge endpoint is rate limited per wallet address.

### 2. Verify the signature

`POST /wallet/verify`

```json
{
  "walletAddress": "G…",
  "nonce": "9f2c…",
  "signature": "base64-encoded-64-byte-ed25519-signature"
}
```

If the wallet is linked to an account:

```json
{
  "linked": true,
  "walletAddress": "G…",
  "accessToken": "…",
  "refreshToken": "…",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "refreshExpiresIn": 2592000,
  "user": { "id": "…", "name": "…", "email": "…", "createdAt": "…" }
}
```

The account token is the same JWT pair issued by password login and works on
every authenticated endpoint.

If the wallet is **not** linked, the response is a wallet-only session:

```json
{
  "linked": false,
  "walletAddress": "G…",
  "accessToken": "…",
  "tokenType": "WalletSession",
  "expiresIn": 86400,
  "user": null
}
```

Wallet-only sessions are accepted only by wallet-session endpoints
(`GET /wallet/session`, `POST /wallet/logout`). They are deliberately rejected
by account endpoints, which assume a full user record. This keeps a
wallet-only identity from inheriting account privileges it does not have.

### 3. Inspect or end the session

```http
GET /wallet/session
Authorization: Bearer <wallet session token>
```

```json
{
  "walletAddress": "G…",
  "userId": null,
  "expiresAt": "2026-10-19T12:00:00.000Z",
  "createdAt": "2026-10-18T12:00:00.000Z",
  "lastSeenAt": "2026-10-18T12:10:00.000Z",
  "linked": false,
  "user": null
}
```

```http
POST /wallet/logout
Authorization: Bearer <wallet session token>
```

Logout revokes the server-side session immediately, even if the JWT's own
`exp` has not passed.

### 4. Link a wallet to an account

`POST /wallet/link` requires an account access token **and** a valid challenge
signature:

```json
{
  "walletAddress": "G…",
  "nonce": "9f2c…",
  "signature": "base64…"
}
```

Linking without a signature proof is not possible: the nonce is single-use and
the signature must match the address. A wallet already attached to a different
account returns `409 Conflict`. After linking, `POST /wallet/verify` returns
the account token pair shown above.

## Security properties

| Property | Implementation |
| --- | --- |
| Challenge is server-issued | Only a stored `wallet_challenges` row is accepted; the client sends a nonce, not free-form message text. |
| Replay protection | `consumedAt` is set with a compare-and-set (`UPDATE … WHERE consumedAt IS NULL`), so exactly one concurrent verification succeeds. |
| Expiry | Server-side `expiresAt` is checked before the signature; the JWT and the session row both expire too. |
| Domain binding | `WALLET_AUTH_DOMAIN` is embedded in the signed message and checked against the server value. |
| Address binding | The message's wallet, the presented wallet, and the verified public key must all agree. |
| Signature verification | Node's built-in ed25519 verifier over the raw strkey payload; no private material is handled. |
| Session revocation | Wallet sessions are stored with a `jti`; logout sets `revokedAt` and validation rejects revoked or expired rows. |
| Token separation | Wallet tokens carry `type: "wallet-session"` and are rejected by the account `JwtStrategy`. |
| Brute force | Challenge creation and verification are rate limited per wallet address and IP. |
| Address validation | Only `G…` ed25519 account addresses are accepted; muxed `M…` and contract `C…` addresses are rejected. |

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `WALLET_AUTH_DOMAIN` | `stellar-hunts.app` | Domain bound into every challenge. Set this to the production site origin. |
| `WALLET_CHALLENGE_TTL_SECONDS` | `300` | Challenge lifetime (30–900). |
| `WALLET_SESSION_EXPIRES_IN` | `24h` | Wallet-only session lifetime, in `15m`/`24h`/`7d` format. |

Configuration is validated at startup together with the rest of the
environment (`backend/src/config/config.validation.ts`).

## Client example

```js
import { signMessage } from "@stellar/freighter-api";

const challenge = await fetch(`${API}/wallet/challenge`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ walletAddress }),
}).then((response) => response.json());

const { signedMessage } = await signMessage(challenge.message);

const session = await fetch(`${API}/wallet/verify`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    walletAddress,
    nonce: challenge.nonce,
    signature: signedMessage,
  }),
}).then((response) => response.json());
```

Store `session.accessToken` in memory (not `localStorage`) and send it as
`Authorization: Bearer <token>`.

## Known limitations

- Hardware/multisig accounts and muxed addresses are not supported by this
  flow; only single ed25519 account keys can sign a challenge.
- A wallet that is not linked to an account cannot call account endpoints; the
  client should prompt the user to sign in and link a wallet.
- Wallet challenges and sessions are pruned daily by the wallet service
  (`pruneExpiredChallenges`, `pruneExpiredSessions`) when the scheduler is
  enabled.
