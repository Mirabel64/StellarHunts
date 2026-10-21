import { Networks } from "@stellar/stellar-sdk";

const NETWORK_LABELS = {
  [Networks.PUBLIC]: "Mainnet",
  [Networks.TESTNET]: "Testnet",
  [Networks.FUTURENET]: "Futurenet",
};

const NETWORK_NAMES = {
  [Networks.PUBLIC]: "PUBLIC",
  [Networks.TESTNET]: "TESTNET",
  [Networks.FUTURENET]: "FUTURENET",
};

/**
 * Human-readable label for a Stellar network passphrase. Unknown/custom
 * networks fall back to the raw passphrase so the user still sees something
 * meaningful.
 *
 * @param {string|null|undefined} passphrase
 * @returns {string}
 */
export function getNetworkLabel(passphrase) {
  if (!passphrase) return "Unknown network";
  return NETWORK_LABELS[passphrase] || passphrase;
}

/**
 * Freighter's internal network identifier (e.g. "TESTNET") for a passphrase.
 *
 * @param {string|null|undefined} passphrase
 * @returns {string}
 */
export function getNetworkName(passphrase) {
  if (!passphrase) return "";
  return NETWORK_NAMES[passphrase] || passphrase;
}

/**
 * Locate an optional programmatic network-switch API exposed by the wallet
 * extension. Freighter's public npm API does not currently support switching,
 * so this is best-effort: when the injected global exposes `changeNetwork` or
 * `setNetwork` we use it, otherwise callers fall back to manual instructions.
 *
 * @returns {{ call: Function, method: string } | null}
 */
export function findNetworkSwitcher() {
  if (typeof window === "undefined") return null;

  const candidates = [
    window.freighter,
    window.stellarWallets,
    window.stellarWalletsKit,
    window.freighterApi,
  ];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    for (const method of ["changeNetwork", "setNetwork"]) {
      if (typeof candidate[method] === "function") {
        return { call: candidate[method].bind(candidate), method };
      }
    }
  }

  return null;
}
