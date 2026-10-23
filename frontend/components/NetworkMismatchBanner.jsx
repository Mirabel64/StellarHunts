"use client";

import { useState } from "react";
import { AlertTriangle, ArrowRightLeft, RefreshCw } from "lucide-react";
import { getNetworkLabel } from "@/lib/network";

/**
 * NetworkMismatchBanner
 * ---------------------
 * Warns the user that their wallet is connected to the wrong Stellar network
 * and blocks on-chain actions until it is resolved (#731). When the wallet
 * exposes a programmatic switch API we offer a one-click switch; otherwise we
 * show the exact manual steps and a retry button.
 */
export default function NetworkMismatchBanner({
  currentNetwork,
  expectedNetwork,
  canSwitch = false,
  onSwitch,
  onRetry,
}) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");

  const currentLabel = getNetworkLabel(currentNetwork);
  const expectedLabel = getNetworkLabel(expectedNetwork);

  const handleSwitch = async () => {
    if (typeof onSwitch !== "function") return;
    setBusy(true);
    setFeedback("");
    try {
      const result = await onSwitch();
      if (result?.switched) {
        setFeedback(`Switched to ${expectedLabel}. Re-checking your wallet…`);
      } else if (result?.supported === false) {
        setFeedback(
          "This wallet does not support one-click switching. Switch manually in Freighter, then click Retry."
        );
      } else {
        setFeedback(
          "The wallet did not confirm the switch. Switch manually in Freighter, then click Retry."
        );
      }
    } catch {
      setFeedback(
        "Could not switch networks automatically. Switch manually in Freighter, then click Retry."
      );
    } finally {
      setBusy(false);
    }
  };

  const handleRetry = async () => {
    if (typeof onRetry !== "function") return;
    setBusy(true);
    setFeedback("");
    try {
      await onRetry();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="alert"
      className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm text-amber-100"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-300" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-amber-200">Wrong network</p>
          <p className="mt-1">
            Your wallet is connected to <strong>{currentLabel}</strong>, but
            StellarHunts requires <strong>{expectedLabel}</strong>.
          </p>
          <p className="mt-1 text-amber-200/80">
            On-chain submissions are disabled until the network matches.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {canSwitch ? (
              <button
                type="button"
                onClick={handleSwitch}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-amber-300 disabled:opacity-50"
              >
                <ArrowRightLeft className="h-3.5 w-3.5" />
                Switch to {expectedLabel}
              </button>
            ) : (
              <p className="text-xs text-amber-200/90">
                Open Freighter, go to Settings, select{" "}
                <strong>{expectedLabel}</strong>, then click Retry.
              </p>
            )}
            <button
              type="button"
              onClick={handleRetry}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-300/40 px-3 py-1.5 text-xs font-semibold text-amber-200 transition hover:bg-amber-400/10 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
              Retry
            </button>
          </div>

          {feedback && (
            <p className="mt-2 text-xs text-amber-200/90" aria-live="polite">
              {feedback}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
