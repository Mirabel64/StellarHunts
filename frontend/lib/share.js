const DEFAULT_URL =
  process.env.NEXT_PUBLIC_SHARE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://stellarhunts.com";

/** Share text for a completed puzzle. Never includes the answer or puzzle id. */
export function buildShareText(puzzleTitle) {
  const title = puzzleTitle ? `"${puzzleTitle}"` : "a puzzle";
  return `I just solved ${title} on StellarHunts! Think you can beat me?`;
}

/** X (Twitter) web intent URL; opening it from a click needs no popup. */
export function buildXShareUrl(puzzleTitle, url = DEFAULT_URL) {
  const params = new URLSearchParams({ text: buildShareText(puzzleTitle), url });
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

/** Text to paste into Discord (which has no share-URL scheme). */
export function buildDiscordMessage(puzzleTitle, url = DEFAULT_URL) {
  return `${buildShareText(puzzleTitle)}\n${url}`;
}

/** Copies text to the clipboard; resolves false when unavailable or denied. */
export async function copyToClipboard(text) {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }
  return false;
}

export { DEFAULT_URL as SHARE_URL };
