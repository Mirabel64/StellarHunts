# Soroban Storage Footprint & Rent Analysis

This document provides a comprehensive analysis of the on-chain storage footprint, rent requirements, and TTL lifecycle management across all StellarHunts Soroban smart contracts (`stellar_hunts`, `stellar_hunts_nft`, and `stellar_hunts_receiver`).

---

## 1. Overview of Contract Architecture & Storage Types

Soroban (Stellar's smart contract platform) separates state into three storage tiers:

1. **Instance Storage**: Stored directly with the contract instance. Shares the contract's executable TTL. When the instance TTL expires, the contract and all its instance storage entries become inaccessible until restored.
2. **Persistent Storage**: Independent key-value entries with individual TTLs. Can be extended indefinitely and never deleted automatically unless TTL reaches 0 and entry is archived. Archival allows restoration via `restoreFootprint`.
3. **Temporary Storage**: Ephemeral entries deleted permanently once their TTL expires. Cost is significantly lower, but cannot be restored. (Not currently used for persistent player progress or NFT assets).

---

## 2. Inventory of Storage Entries by Contract

### 2.1 Game Contract (`stellar_hunts`)

| Storage Key | Storage Tier | Key Size (Bytes) | Stored Value Type | Value Size (Bytes) | Scope / Multiplicity |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `DataKey::Admin` | Instance | 32 | `Address` | 32 | Global (1 per contract) |
| `DataKey::PendingAdmin` | Instance | 32 | `Address` (optional) | 32 | Global (0–1 per contract) |
| `DataKey::NftContract` | Instance | 32 | `Address` | 32 | Global (1 per contract) |
| `DataKey::QuestionCount` | Instance | 32 | `u64` | 8 | Global (1 per contract) |
| `DataKey::QuestionPerLevel` | Instance | 32 | `u32` | 4 | Global (1 per contract) |
| `DataKey::QuestionCapByLevel(Levels)` | Instance | 36 | `u32` | 4 | Up to 4 (per difficulty level) |
| `DataKey::QuestionPerLevelIndex(Levels)` | Instance | 36 | `u32` | 4 | Up to 4 (per difficulty level) |
| `DataKey::Paused` | Instance | 32 | `bool` | 1 | Global (1 per contract) |
| `DataKey::SchemaVersion` | Persistent | 32 | `u32` | 4 | Global (1 per contract) |
| `DataKey::Question(u64)` | Persistent | 40 | `Question` struct | 150 – 6,200 | Per question in the game |
| `DataKey::RetiredQuestion(u64)` | Persistent | 40 | `bool` | 1 | Per retired question |
| `DataKey::QuestionsByLevel(Levels, u32)`| Persistent | 40 | `u64` | 8 | Per question indexed |
| `DataKey::PlayerProgressV2(Address)` | Persistent | 64 | `PlayerProgressV2` | 44 | **1 per registered player** |
| `DataKey::PlayerLevelProgressV2(Address, Levels)` | Persistent | 68 | `LevelProgressV2` | 56 | **Up to 4 per player** (1 per level) |

### 2.2 NFT Badge Contract (`stellar_hunts_nft`)

| Storage Key | Storage Tier | Key Size (Bytes) | Stored Value Type | Value Size (Bytes) | Scope / Multiplicity |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `NftDataKey::Admin` | Instance | 32 | `Address` | 32 | Global (1 per contract) |
| `NftDataKey::PendingAdmin` | Instance | 32 | `Address` | 32 | Global (0–1 per contract) |
| `NftDataKey::Paused` | Instance | 32 | `bool` | 1 | Global (1 per contract) |
| `NftDataKey::BaseUri` | Instance | 32 | `String` (max 200 chars)| ~200 | Global (1 per contract) |
| `NftDataKey::Name` | Instance | 32 | `String` (max 64 chars) | ~64 | Global (1 per contract) |
| `NftDataKey::Symbol` | Instance | 32 | `String` (max 16 chars) | ~16 | Global (1 per contract) |
| `NftDataKey::Minters(Address)` | Instance | 64 | `bool` | 1 | Per authorized minter |
| `NftDataKey::SchemaVersion` | Instance | 32 | `u32` | 4 | Global (1 per contract) |
| `NftDataKey::Badge(Address, Levels)` | Persistent | 68 | `bool` | 1 | **Up to 4 per player** |
| `NftDataKey::BadgeData(Address, Levels)` | Persistent | 68 | `BadgeData` struct | 40 | **Up to 4 per player** |

### 2.3 Receiver Contract (`stellar_hunts_receiver`)

The receiver contract is a stateless testing mock. It writes zero storage entries.

---

## 3. Table of Storage Entries per User

For an active player progressing through all 4 difficulty levels (`Easy`, `Medium`, `Hard`, `Master`), the following storage footprint is allocated on-chain:

| Contract | Entry Key Variant | Key Size (Bytes) | Value Size (Bytes) | Total Entry Size | Count per Completed User | Total Bytes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `stellar_hunts` | `PlayerProgressV2(Address)` | 64 B | 44 B | 108 B | 1 | 108 B |
| `stellar_hunts` | `PlayerLevelProgressV2(Address, Levels)` | 68 B | 56 B | 124 B | 4 | 496 B |
| `stellar_hunts_nft`| `Badge(Address, Levels)` | 68 B | 1 B | 69 B | 4 | 276 B |
| `stellar_hunts_nft`| `BadgeData(Address, Levels)` | 68 B | 40 B | 108 B | 4 | 432 B |
| **Combined Total** | | | | | **13 entries** | **1,312 Bytes (~1.28 KB)** |

*Notes on per-user entry lifecycle:*
- Upon account initialization: 1 `PlayerProgressV2` entry (108 B) and 1 `PlayerLevelProgressV2` entry for level 1 (124 B). Total = 2 entries, 232 B.
- As the player attempts other levels and earns NFT badges, entries scale to a maximum of 13 entries (~1.31 KB) per user.

---

## 4. Estimated XLM Rent Costs

Soroban rent fees are governed by network ledger close intervals and rent fee configurations.

### 4.1 Stellar Network Constants
- **Ledger time**: ~5.0 seconds per ledger
- **Ledgers per day**: $86,400 / 5 \approx 17,280$ ledgers
- **Ledgers per month (30 days)**: $518,400$ ledgers
- **Ledgers per year (365 days)**: $6,307,200$ ledgers

### 4.2 Soroban Protocol Rent Rates (Mainnet Baseline)
Rent is billed per entry and per kilobyte for the duration the TTL is extended:
- **Base write fee**: ~0.000000025 XLM ($25\text{ stroops}$) per entry per 1,000 ledgers ($\approx 0.1577\text{ XLM}$ per entry per year).
- **Byte storage fee**: ~0.000000005 XLM ($5\text{ stroops}$) per KB per 1,000 ledgers ($\approx 0.0315\text{ XLM}$ per KB per year).

### 4.3 Cost Breakdown per User

| Metric | Per Day | Per Month (30 Days) | Per Year (365 Days) |
| :--- | :--- | :--- | :--- |
| **`stellar_hunts` (5 entries, 604 B)** | 0.0022 XLM | 0.0658 XLM | 0.8012 XLM |
| **`stellar_hunts_nft` (8 entries, 708 B)** | 0.0035 XLM | 0.1051 XLM | 1.2783 XLM |
| **Total per Fully-Completed User (13 entries)** | **0.0057 XLM** | **0.1709 XLM** | **2.0795 XLM** |
| **Total for 1,000 Active Users** | **5.70 XLM** | **170.90 XLM** | **2,079.50 XLM** |
| **Total for 10,000 Active Users** | **57.00 XLM** | **1,709.00 XLM** | **20,795.00 XLM** |

---

## 5. Recommendations for TTL Management

To ensure low operational overhead, prevent unintended state archival, and optimize rent expenditure, the following TTL management strategy is recommended:

### 5.1 Automatic In-Flight TTL Extensions
Whenever a player submits an answer or claims a badge, the contracts should proactively bump the TTL of the modified and accessed storage entries.

**Recommended Parameters:**
- `threshold_ledgers`: **100,000 ledgers** (~5.8 days)
- `extend_by_ledgers`: **518,400 ledgers** (~30 days)

```rust
// Example TTL bump for player progress entry in stellar_hunts
let key = DataKey::PlayerProgressV2(player.clone());
env.storage().persistent().extend_ttl(&key, 100_000, 518_400);
```

### 5.2 Contract Instance TTL Maintenance
The contract instance storage and WASM bytecode must be kept alive by the operator:
- The contract admin or an automated cron keeper (e.g., via the backend outbox worker or Stellar CLI task) should invoke `extend_ttl` on `env.storage().instance()` once every 14 days with an extension to 1,000,000 ledgers (~58 days).
- If the instance expires, transactions sent to the contract will fail with `HostError` until the contract instance is restored via a `RestoreFootprintOp`.

### 5.3 Inactive Player Archival & Restoration Policy
- Inactive accounts whose TTL expires are archived by the Soroban node rather than erased.
- Frontend components should catch archived footprint errors (via `ChainErrorBoundary`, issue #705) and notify the user or auto-submit a `RestoreFootprintOp` transaction to restore the state before re-attempting the contract call.

### 5.4 Sponsoring Reserves Buffer
- The deploying administrator account should fund each contract account with an operating reserve of **50–100 XLM** on testnet/mainnet. This balance covers the initial rent write allocations and automated bumps without burdening early players.
