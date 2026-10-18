# Personal data export

`GET /users/me/export` returns everything StellarHunts stores about the
signed-in user as one JSON document. It implements the "right of access /
portability" expectation of GDPR-style privacy policies: a user can obtain
their own records without an operator running a database query.

## Request

```http
GET /api/v1/users/me/export
Authorization: Bearer <account access token>
```

- **Authentication:** required. A standard account token (password or linked
  wallet login) must be presented; wallet-only sessions are rejected because
  they have no account record to export.
- **Rate limit:** 5 exports per hour per account. The response includes
  `Retry-After` when the limit is exceeded.
- **Caching:** `Cache-Control: no-store, private` and
  `X-Content-Type-Options: nosniff`.
- **Delivery:** the JSON body is returned as a downloadable attachment named
  `stellarshunts-data-export-<userId>-<YYYY-MM-DD>.json`.

## Payload

```json
{
  "schemaVersion": "1.0",
  "generatedAt": "2026-10-18T12:00:00.000Z",
  "user": {
    "id": "…",
    "name": "…",
    "username": "…",
    "email": "…",
    "bio": "…",
    "avatarUrl": "…",
    "walletAddress": "G…",
    "isActive": true,
    "createdAt": "…",
    "updatedAt": "…",
    "lastLoginAt": "…"
  },
  "records": {
    "progress": [ … ],
    "puzzle_completions": [ … ],
    "inventory": [ … ],
    "streaks": [ … ],
    "user_settings": [ … ],
    "wallet_sessions": [ … ]
  }
}
```

`schemaVersion` is bumped when the shape changes. New top-level keys may be
added without a bump, so consumers should ignore unknown `records` keys.

## What is included

The table list is derived from TypeORM metadata at request time: every entity
with a `userId` column is exported, and entities with a `walletAddress` (or
`address`) column are also queried for the user's linked wallet. That means a
new feature table is included automatically instead of being silently missed.

The user's own `users` row is exported explicitly. Operator-only tables
(`admins`) are never exported.

Tables with a wallet column are queried by `userId` **or** wallet address, so
records created before the address was linked still appear.

## What is redacted

Credentials are never useful in an export and are removed even when hashed:

- any column named `password`, `passwordHash`, `token`, `tokenHash`,
  `accessToken`, `refreshToken`, `apiKey`, `keyHash`, `secret`, `jti`,
  `signature`, `nonce`, or `challenge`;
- keys matching the same concepts inside JSON columns (for example token
  metadata or audit metadata), replaced with `"[redacted]"`.

Everything else is returned as stored, including IP addresses and user agents
that may appear in security metadata, because those are the user's personal
data.

## Failure behaviour

An export must not fail because one legacy table is missing a column its
entity metadata expects. Per-table failures are logged by table name (never by
row contents) and omitted from `records`; the rest of the export still
completes. An unknown or deleted user returns `404`.

## Implementation

- `backend/src/data-export/data-export.service.ts` — metadata discovery,
  scoping queries, redaction.
- `backend/src/data-export/data-export.controller.ts` — authentication, rate
  limiting, response headers.
- `backend/src/data-export/data-export.service.spec.ts` — completeness and
  redaction tests.
