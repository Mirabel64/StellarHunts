"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import NetworkMismatchBanner from "@/components/NetworkMismatchBanner";
import { useWalletConnection, WALLET_STATUS } from "@/hooks/useWalletConnection";

/**
 * localStorage key used to persist the last connected Stellar address so the
 * button can show a stable session across page reloads (#691).
 */
const STORAGE_KEY = "stellarhunts.wallet.address";

/**
 * Shorten a Stellar public key for display, e.g. GABCDE...WXYZ.
 */
function shortenAddress(address) {
  if (!address) return "";
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

/**
 * WalletConnectButton
 * --------------------
 * Freighter wallet connect button (#691). Wraps `useWalletConnection` to
 * expose a single control that:
 *  - connects / disconnects via Freighter
 *  - displays the active account address
 *  - surfaces a user rejection or a missing extension
 *  - restores the last connected address across reloads
 */
export default function WalletConnectButton({ className = "" }) {
  const {
    status,
    address,
    network,
    expectedNetwork,
    unsupportedNetwork,
    switchSupported,
    switchNetwork,
    error,
    isExtensionInstalled,
    connect,
    disconnect,
    refresh,
  } = useWalletConnection();

  const isConnecting = status === WALLET_STATUS.CONNECTING;
  const isConnected = status === WALLET_STATUS.CONNECTED && Boolean(address);

  // Persist the connected address so a reload keeps showing the active
  // account instead of flashing back to the disconnected state.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isConnected && address) {
      window.localStorage.setItem(STORAGE_KEY, address);
    } else if (status === WALLET_STATUS.DISCONNECTED) {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [isConnected, address, status]);

  return (
    <div className={className}>
      {isConnected ? (
        <div className="flex items-center gap-3">
          <span
            className="font-mono text-sm text-neutral-700 dark:text-neutral-200"
            title={address}
          >
            {shortenAddress(address)}
          </span>
          <Button variant="outline" size="sm" onClick={disconnect}>
            Disconnect
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          onClick={connect}
          disabled={isConnecting}
          aria-busy={isConnecting}
        >
          {isConnecting ? (
            <>
              <LoadingSpinner size="sm" />
              Connecting
            </>
          ) : (
            "Connect Wallet"
          )}
        </Button>
      )}

      {isConnected && unsupportedNetwork && (
        <div className="mt-3 w-full">
          <NetworkMismatchBanner
            currentNetwork={network}
            expectedNetwork={expectedNetwork}
            canSwitch={switchSupported}
            onSwitch={switchNetwork}
            onRetry={refresh}
          />
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-500" role="alert">
          {error}
        </p>
      )}

      {!error && !isConnected && status === WALLET_STATUS.DISCONNECTED && !isExtensionInstalled && (
        <p className="mt-2 text-xs text-neutral-500">
          Freighter extension not detected.
        </p>
      )}
    </div>
  );
}
