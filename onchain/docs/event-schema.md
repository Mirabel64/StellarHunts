# StellarHunts On-Chain Event Schema

This document specifies the canonical event schema emitted by StellarHunts Soroban smart contracts (`stellar-hunts` and `stellar-hunts-nft`). Indexers, analytics services, and off-chain daemons can rely on this specification for parsing and indexing on-chain state transitions.

---

## 1. Design & Versioning Invariants

1. **Positional Payload Invariant**: Soroban SDK emits event payloads as positional tuples. Decoders rely on exact field ordering and types. Fields must **never** be reordered or removed in existing topics.
2. **Schema Evolution**:
   - Minor additions that extend an existing event should be added by introducing a new topic (e.g. `answer_submitted_v2`) or documenting appended fields with backward-compatible decoders.
   - Topics use snake_case symbols (e.g. `question_added`, `badge_staked`).
3. **Emitter Namespacing**:
   - `stellar-hunts` (game contract) and `stellar-hunts-nft` (NFT badge contract) each have distinct contract addresses.
   - Topics that share similar names (e.g., `level_badge_minted`) are distinguished by their contract address and payload arity (see table below).

---

## 2. StellarHunts Game Contract (`stellar-hunts`) Events

All mutating entrypoints publish structured events.

| Topic Symbol | Payload Tuple | Payload Types | Trigger Condition |
| :--- | :--- | :--- | :--- |
| `game_initialized` | `(admin, schema_version)` | `(Address, u32)` | Contract `init()` called successfully |
| `admin_transfer_proposed` | `(current_admin, new_admin)` | `(Address, Address)` | `propose_admin()` called by active admin |
| `admin_transfer_accepted` | `(previous_admin, new_admin)` | `(Address, Address)` | `accept_admin()` called by pending admin |
| `upgrader_updated` | `(upgrader,)` | `(Address,)` | `set_upgrader()` called by admin |
| `contract_upgraded` | `(upgrader, new_wasm_hash)` | `(Address, BytesN<32>)` | `upgrade()` invoked by authorized upgrader |
| `question_added` | `(question_id, level)` | `(u64, Levels)` | `add_question()` saves a new puzzle |
| `question_updated` | `(question_id, level)` | `(u64, Levels)` | `update_question()` updates puzzle details/level |
| `question_per_level_updated` | `(amount,)` | `(u32,)` | `set_question_per_level()` updates level capacity |
| `question_retired` | `(question_id,)` | `(u64,)` | `retire_question()` soft-deletes a puzzle |
| `nft_contract_updated` | `(old_address, new_address)` | `(Option<Address>, Address)` | `set_nft_contract_address()` re-points NFT contract |
| `answer_submitted` | `(caller, question_id, level, is_correct)` | `(Address, u64, Levels, bool)` | Player calls `submit_answer()` |
| `hint_requested` | `(caller, question_id, level)` | `(Address, u64, Levels)` | Player requests hint via `request_hint()` |
| `level_completed` | `(caller, completed_level, next_level)` | `(Address, Levels, Levels)` | Final active question in level answered correctly |
| `level_badge_minted` | `(player, level)` | `(Address, Levels)` | Player claims level completion NFT badge |
| `contract_paused` | `(admin,)` | `(Address,)` | Admin invokes `pause()` |
| `contract_unpaused` | `(admin,)` | `(Address,)` | Admin invokes `unpause()` |
| `schema_migrated` | `(from_version, to_version)` | `(u32, u32)` | Admin runs `migrate_schema()` |
| `player_initialized` | `(player, initial_level)` | `(Address, Levels)` | First player interaction auto-initializes progress |
| `event_created` | `(event_id, start_time, end_time, multiplier_bps)` | `(u64, u64, u64, u32)` | Admin creates hunt event via `create_event()` |
| `badge_staked` | `(player, event_id, level)` | `(Address, u64, Levels)` | Player stakes level badge in active event |
| `badge_unstaked` | `(player, event_id, level)` | `(Address, u64, Levels)` | Player unstakes badge from event |
| `stake_slashed` | `(player, event_id, level)` | `(Address, u64, Levels)` | Stake is slashed after event expires |

---

## 3. StellarHunts NFT Contract (`stellar-hunts-nft`) Events

| Topic Symbol | Payload Tuple | Payload Types | Trigger Condition |
| :--- | :--- | :--- | :--- |
| `nft_initialized` | `(admin, game_contract)` | `(Address, Address)` | NFT contract `init()` called successfully |
| `admin_transfer_proposed` | `(admin, new_admin)` | `(Address, Address)` | `propose_admin()` called by active admin |
| `admin_transfer_accepted` | `(previous_admin, new_admin)` | `(Address, Address)` | `accept_admin()` called by pending admin |
| `nft_contract_paused` | `(admin,)` | `(Address,)` | Admin invokes `pause()` |
| `nft_contract_unpaused` | `(admin,)` | `(Address,)` | Admin invokes `unpause()` |
| `level_badge_minted` | `(recipient, level, minter, admin)` | `(Address, Levels, Address, Address)` | `mint_level_badge()` executed |
| `minter_role_granted` | `(account,)` | `(Address,)` | Admin calls `grant_minter_role()` |
| `minter_role_revoked` | `(account,)` | `(Address,)` | Admin calls `revoke_minter_role()` |

> **Note on `level_badge_minted` topic**:
> - When emitted by `stellar-hunts`, payload is `(player, level)` (2 elements).
> - When emitted by `stellar-hunts-nft`, payload is `(recipient, level, minter, admin)` (4 elements).
> Indexers must either match on contract address or discriminate based on payload tuple length.

---

## 4. Indexer Ingestion & Validation Guidelines

1. **Extract Topics**: Topic 0 is the Symbol identifier.
2. **Arity Validation**: Match tuple element count against table above.
3. **Type Conversions**:
   - `Address`: Stellar StrKey format (`G...` or `C...`).
   - `u64`: Unsigned 64-bit integer (represented as bigint or string in JS).
   - `u32`: Unsigned 32-bit integer.
   - `Levels`: Enum variants `0: Easy`, `1: Medium`, `2: Hard`, `3: Expert`.
   - `bool`: Boolean `true` or `false`.
   - `BytesN<32>`: 32-byte hex-encoded string.
