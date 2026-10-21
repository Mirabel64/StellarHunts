"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useWalletConnection, WALLET_STATUS } from "./useWalletConnection";

/**
 * useWalletSession
 * ----------------
 * A higher-level hook that wraps `useWalletConnection` and adds:
 *
 *  1. **In-flight transaction tracking** — callers register pending tx
 *     requests via `registerTx(id, controller)`. The hook holds a Map of
 *     `AbortController`s keyed by arbitrary tx IDs.
 *
 *  2. **Abort on account change / disconnect** — whenever the connected
 *     address changes or the wallet disconnects, all tracked in-flight
 *     requests are aborted immediately so stale tx flows cannot complete.
 *
 *  3. **App-state reset on disconnect** — calls the Zustand store's
 *     `resetAll` action when the wallet disconnects, clearing any
 *     user-specific state from the React tree.
 *
 *  4. **session-changed CustomEvent** — dispatches a `session-changed`
 *     event on `window` with `{ detail: { reason, address } }` so deeply
 *     nested components can react without prop-drilling.
 *
 * Exports (spread with `...walletConnectionState`):
 *   All fields from `useWalletConnection` PLUS:
 *   - `pendingTxCount`  {number}    Number of currently tracked in-flight txs
 *   - `registerTx`     {Function}  Register a tx: (id, abortController) => void
 *   - `abortAllTx`     {Function}  Manually abort all in-flight txs
 *
 * @param {object}   opts
 * @param {Function} [opts.getStore]      Optional factory that returns the
 *                                         Zustand store with a `resetAll` method.
 *                                         Defaults to lazy require of
 *                                         `../store/useAppStore`.
 * @param {number}   [opts.pollInterval]  Forwarded to useWalletConnection.
 */
export function useWalletSession(opts = {}) {
  const { getStore, pollInterval } = opts;

  // ── underlying connection hook ──────────────────────────────────────────
  const walletConnection = useWalletConnection({ pollInterval });
  const { address, isConnected, disconnect: baseDisconnect } = walletConnection;

  // ── in-flight tx registry ───────────────────────────────────────────────
  /**
   * Map<txId: string, AbortController>
   * Using useRef so mutating it does not trigger re-renders. pendingTxCount
   * is the reactive projection of the map's size.
   */
  const txRegistryRef = useRef(new Map());
  const [pendingTxCount, setPendingTxCount] = useState(0);

  const syncCount = useCallback(() => {
    setPendingTxCount(txRegistryRef.current.size);
  }, []);

  /**
   * Register an in-flight transaction.
   * @param {string}          id         Unique identifier for this tx request
   * @param {AbortController} controller AbortController whose signal is passed
   *                                     to fetch / XDR-sign calls
   */
  const registerTx = useCallback(
    (id, controller) => {
      if (!(controller instanceof AbortController)) {
        if (typeof window !== "undefined") {
          console.warn(
            `[useWalletSession] registerTx: expected AbortController for id="${id}"`
          );
        }
        return;
      }
      txRegistryRef.current.set(id, controller);
      syncCount();
    },
    [syncCount]
  );

  /**
   * Abort and deregister all tracked in-flight transactions.
   * Automatically called when account changes or disconnects.
   */
  const abortAllTx = useCallback(
    (reason = "session-changed") => {
      const registry = txRegistryRef.current;
      if (registry.size === 0) return;

      for (const [id, controller] of registry.entries()) {
        try {
          controller.abort(reason);
        } catch {
          // AbortController.abort should never throw, but be defensive
        }
        registry.delete(id);
      }
      syncCount();
    },
    [syncCount]
  );

  // ── session-changed event emitter ───────────────────────────────────────
  const emitSessionChanged = useCallback((reason, newAddress) => {
    if (typeof window === "undefined") return;
    try {
      window.dispatchEvent(
        new CustomEvent("session-changed", {
          detail: { reason, address: newAddress ?? null },
          bubbles: true,
        })
      );
    } catch {
      // CustomEvent unavailable in some SSR environments
    }
  }, []);

  // ── Zustand store reset ─────────────────────────────────────────────────
  const resetAppStore = useCallback(() => {
    try {
      // Support injected store factory (for testing) or dynamic import
      const factory =
        getStore ??
        (() => {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { useAppStore } = require("../store/useAppStore");
          return useAppStore.getState();
        });
      const store = factory();
      if (typeof store?.resetAll === "function") {
        store.resetAll();
      }
    } catch {
      // Store not available (SSR, test env, etc.) — silently skip
    }
  }, [getStore]);

  // ── Track previous address to detect changes ────────────────────────────
  const prevAddressRef = useRef(address);

  useEffect(() => {
    const prevAddress = prevAddressRef.current;
    prevAddressRef.current = address;

    // Disconnect detected: address dropped to null while was connected
    if (prevAddress !== null && address === null && !isConnected) {
      abortAllTx("wallet-disconnected");
      resetAppStore();
      emitSessionChanged("wallet-disconnected", null);
      return;
    }

    // Account switch: address changed to a different non-null value
    if (
      prevAddress !== null &&
      address !== null &&
      prevAddress !== address
    ) {
      abortAllTx("account-changed");
      // Note: we do NOT reset the full app store on account change —
      // we only abort pending txs and let the UI re-sync with the new address.
      emitSessionChanged("account-changed", address);
    }
  }, [address, isConnected, abortAllTx, resetAppStore, emitSessionChanged]);

  // ── Wrapped disconnect that also aborts & resets ─────────────────────────
  const disconnect = useCallback(() => {
    abortAllTx("manual-disconnect");
    resetAppStore();
    emitSessionChanged("manual-disconnect", null);
    baseDisconnect();
  }, [abortAllTx, resetAppStore, emitSessionChanged, baseDisconnect]);

  return {
    // Spread all underlying wallet connection state
    ...walletConnection,
    // Override disconnect with the session-aware version
    disconnect,
    // Session-specific additions
    pendingTxCount,
    registerTx,
    abortAllTx,
  };
}

export default useWalletSession;