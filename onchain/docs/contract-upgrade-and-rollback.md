# Contract Upgrade & Rollback Procedure

This document outlines the architecture, authorization requirements, deployment workflow, and rollback runbook for the StellarHunts Soroban smart contracts (`stellar-hunts` and `stellar-hunts-nft`).

---

## 1. Upgrade Architecture

Soroban provides native WASM code replacement via `env.deployer().update_current_contract_wasm(new_wasm_hash)`.

### Role-Based Authorization
- Contract upgrades are restricted to the **Upgrader** role.
- Upon contract initialization (`init`), the upgrader is defaulted to the initial contract `admin`.
- The `admin` can designate or transfer the upgrader role using `set_upgrader(env, upgrader_address)`.
- The `upgrade(env, new_wasm_hash)` entrypoint enforces `upgrader.require_auth()`, rejecting any caller not matching the stored upgrader address.
- Every successful upgrade emits a structured `contract_upgraded` event:
  ```rust
  env.events().publish(
      (Symbol::new(&env, "contract_upgraded"),),
      (upgrader, new_wasm_hash),
  );
  ```

---

## 2. Standard Upgrade Workflow

1. **Build and Validate New WASM**:
   ```bash
   cd onchain
   cargo build --target wasm32-unknown-unknown --release -p stellar-hunts
   ```

2. **Install WASM Bytecode On-Chain**:
   Upload the bytecode to the Stellar network to obtain the WASM hash:
   ```bash
   soroban contract install \
     --wasm target/wasm32-unknown-unknown/release/stellar_hunts.wasm \
     --source <DEPLOYER_SECRET_OR_IDENTITY> \
     --network <testnet|mainnet>
   # Output: <NEW_WASM_HASH_32_BYTES_HEX>
   ```

3. **Record Deployed State**:
   Record `<NEW_WASM_HASH>` alongside the corresponding git commit and prior WASM hash in the release registry.

4. **Invoke Upgrade Entrypoint**:
   Call `upgrade` with the authorized upgrader key:
   ```bash
   soroban contract invoke \
     --id <CONTRACT_ADDRESS> \
     --source <UPGRADER_IDENTITY> \
     --network <testnet|mainnet> \
     -- \
     upgrade \
     --new_wasm_hash <NEW_WASM_HASH_32_BYTES_HEX>
   ```

5. **Verify Post-Upgrade State**:
   Verify contract functionality and query version:
   ```bash
   soroban contract invoke \
     --id <CONTRACT_ADDRESS> \
     --network <testnet|mainnet> \
     -- \
     get_schema_version
   ```

---

## 3. Rollback Runbook

When a critical bug, regression, or exploit is detected post-upgrade, execute the following rollback procedure:

### Phase 1: Emergency Circuit-Breaker (Immediate)
If the regression affects player state or question data, pause mutations immediately:
```bash
soroban contract invoke \
  --id <CONTRACT_ADDRESS> \
  --source <ADMIN_IDENTITY> \
  --network <testnet|mainnet> \
  -- \
  pause
```

### Phase 2: Identify Known Good WASM Hash
Locate the previous stable WASM hash from:
1. Release log / deployment registry (`scripts/deploy-contracts.sh` or release notes).
2. On-chain event history by filtering for the prior `contract_upgraded` event.

### Phase 3: Execute Rollback
Invoke the `upgrade` entrypoint using the previous WASM hash:
```bash
soroban contract invoke \
  --id <CONTRACT_ADDRESS> \
  --source <UPGRADER_IDENTITY> \
  --network <testnet|mainnet> \
  -- \
  upgrade \
  --new_wasm_hash <PREVIOUS_WASM_HASH_32_BYTES_HEX>
```

### Phase 4: Data & Schema Verification
1. Ensure persistent storage keys remain intact and readable.
2. Verify contract view functions (e.g. `get_question(1)`, `get_question_per_level()`).
3. If schema migrations were applied during the faulty version, execute compensating data migrations or check `storage-versioning.md` guidelines.

### Phase 5: Re-enable Mutations
Once verified, unpause the contract:
```bash
soroban contract invoke \
  --id <CONTRACT_ADDRESS> \
  --source <ADMIN_IDENTITY> \
  --network <testnet|mainnet> \
  -- \
  unpause
```

### Phase 6: Post-Mortem & Incident Notification
- Verify indexers picked up the `contract_upgraded` and `contract_unpaused` events.
- Document root cause and add regression test coverage.
