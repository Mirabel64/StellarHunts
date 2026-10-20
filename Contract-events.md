emove the unused Error::LevelImmutable variant from the game contract
Repo Avatar
UnityChainxx/StellarHunts
Labels / Complexity: area:contracts, good first issue · Trivial — 1

Summary
Error::LevelImmutable = 11 is declared in onchain/contracts/stellar_hunts/src/lib.rs but never raised anywhere in the crate - the only grep hit is the declaration itself. Dead error variants expand the contract's public error surface and mislead integrators into handling a code that can never occur.

Proposal
Confirm with grep -rn "LevelImmutable" onchain/contracts/ that nothing references it.
Either remove the variant and renumber nothing (leave a gap to keep existing codes stable), or attach it to the places that currently rely on other errors for immutable-level operations, whichever the PR author justifies.
Either remove the variant and renumber nothing (leave a gap to keep existing codes stable), or attach it to the places that currently rely on other errors for immutable-level operations, whichever the PR author justifies.
Either remove the variant and renumber nothing (leave a gap to keep existing codes stable), or attach it to the places that currently rely on other errors for immutable-level operations, whichever the PR author justifies.
Record the decision in the contract error table if one exists.
Acceptance criteria
 No unused Error variant remains in stellar_hunts/src/lib.rs.
 All remaining discriminants stay unique and unchanged.
 cargo test --workspace --locked passes.
Getting started
In scope: onchain/contracts/stellar_hunts/src/lib.rs.
Verify: cd onchain && cargo build --workspace --tests --locked.
Pattern-match against stellar_hunts_nft/src/lib.rs, whose Error enum has exactly the variants it uses.

Contract events use ad-hoc Symbol literals with no documented payload schema for indexers
Repo Avatar
UnityChainxx/StellarHunts
Labels / Complexity: area:contracts, documentation · Medium — 5

Problem
Both contracts publish events with inline Symbol::new(&env, "...") topics and positional tuples, for example:

question_added -> (question_id, level)
question_updated -> (question_id, level)
question_retired -> (question_id,)
nft_contract_updated -> (old, new_address)
answer_submitted -> (caller, question_id, level, is_correct)
hint_requested -> (caller, question_id, level)
level_completed -> (caller, level, next)
level_badge_minted -> (player, level) in the game contract and (recipient, level, minter, admin) in the NFT contract
player_initialized -> (player, Easy)
There is no document listing topics, payload order or types. The two contracts use the same topic string level_badge_minted with different arities, so an indexer that keys on the topic will mis-decode one of them. onchain/docs/storage-versioning.md covers storage keys but not events.

Root cause
Events are written inline at each call site with no shared schema or documented shape.

Why this is architecturally hard
Events are part of the integration contract with indexers and the backend. Freezing a schema means committing to payload ordering for every type, and the duplicate level_badge_minted topic must be resolved - either renamed or documented as two distinct emitters with distinguishable payloads.
Soroban event payloads are positional; adding a field later breaks decoders. The design must say how the schema evolves (new topic vs appended field), mirroring the storage-versioning rules.
Making the events truthful requires fixing the emission sites (for example level_completed currently reports the level being completed and the next level, which indexers may read as the current level).
Proposed design
Add onchain/docs/event-schema.md with a table of topic, contract, payload tuple, types, and emitter condition. Resolve the duplicate level_badge_minted topic and state the evolution rule.

Downstream impact
backend/src/outbox/outbox.service.ts and backend/src/in-game-notifications consume event-like data; the backend integration should reference the schema. Any indexer deployed against the contracts needs the document.

Acceptance criteria
 Every event emitted by all three crates is listed with its payload types and conditions.
 level_badge_minted no longer collides across contracts, or the collision is explicitly documented with a distinguishing field.
 The document states the evolution rule (reserved topic names, never reorder payloads).
 A test asserts the payload shape for at least one event per contract.
Out of scope
Building an indexer.

Getting started
In scope: onchain/docs/event-schema.md (new), both lib.rs event call sites.
Verify: grep -rn "events()" onchain/contracts/*/src/lib.rs then cd onchain && cargo test --workspace --locked.
Good first files to read: the env.events().publish calls in stellar_hunts/src/lib.rs and stellar_hunts_nft/src/lib.rs, onchain/docs/storage-versioning.md for the documentation style.
