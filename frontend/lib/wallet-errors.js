/**
 * User-facing messages for wallet and RPC failures.
 *
 * A raw Freighter or Soroban RPC error is not suitable for the game UI: it
 * often contains a stack trace, a status code, or no message at all. These
 * helpers classify the common failure modes so the UI can show an accurate
 * message instead of labelling a rejected signature as a wrong answer.
 */

export const WALLET_REJECTION_MESSAGE =
  "Transaction was rejected in Freighter. No changes were submitted.";

export const NETWORK_ERROR_MESSAGE =
  "Network error: could not reach the Stellar network. Check your connection and try again.";

// Freighter reports a cancelled prompt with code 4001. Some versions only
// include a message, so both shapes are matched.
const REJECTION_PATTERN =
  /\b(reject|rejected|cancel|cancelled|canceled|denied|declined)\b|4001/i;

// Transport-level failures from fetch/axios or Soroban RPC (including a
// transaction that never reaches a terminal state).
const NETWORK_PATTERN =
  /network|failed to fetch|fetch failed|econnrefused|econnreset|enotfound|etimedout|timed out|timeout|socket hang up|did not finalise in time|\brpc\b|\b50[234]\b/i;

/**
 * Returns a safe message for a wallet/RPC error.
 *
 * The "unsupported network" message is preserved because it tells the user
 * exactly how to recover, while other network failures get a generic
 * connection message.
 *
 * @param {unknown} error
 * @param {string} fallback
 * @returns {string}
 */
export function classifyWalletError(error, fallback = "Transaction failed") {
  const code = error?.code ?? error?.response?.status;
  const raw =
    typeof error === "string"
      ? error
      : error?.message || error?.error?.message || "";

  if (/unsupported network/i.test(raw)) {
    return raw;
  }

  if (code === 4001 || REJECTION_PATTERN.test(raw)) {
    return WALLET_REJECTION_MESSAGE;
  }

  if (
    NETWORK_PATTERN.test(raw) ||
    code === 502 ||
    code === 503 ||
    code === 504
  ) {
    return NETWORK_ERROR_MESSAGE;
  }

  return raw || fallback;
}

export default classifyWalletError;
