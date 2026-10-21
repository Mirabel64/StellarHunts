"use client";

import { useState } from "react";
import {
  SHARE_URL,
  buildDiscordMessage,
  buildXShareUrl,
  copyToClipboard,
} from "@/lib/share";

/**
 * Share card for a completed puzzle. X opens through a plain link (a real
 * click, so popup blockers don't interfere); Discord and "Copy link" copy
 * text to the clipboard, which also serves as the fallback.
 */
export default function ShareCompletion({ puzzleTitle }) {
  const [status, setStatus] = useState("");

  const copy = async (text, doneMessage) => {
    const ok = await copyToClipboard(text);
    setStatus(ok ? doneMessage : "Copy failed - select and copy the link manually.");
  };

  return (
    <div className="rounded-xl border border-white/10 p-4 space-y-3" data-testid="share-completion">
      <p className="text-sm text-gray-300">Share your win</p>
      <div className="flex flex-wrap gap-2">
        <a
          href={buildXShareUrl(puzzleTitle)}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-black px-3 py-1.5 text-sm text-white border border-white/20"
        >
          Share on X
        </a>
        <button
          type="button"
          onClick={() => copy(buildDiscordMessage(puzzleTitle), "Message copied - paste it in Discord.")}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white"
        >
          Copy for Discord
        </button>
        <button
          type="button"
          onClick={() => copy(SHARE_URL, "Link copied.")}
          className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-white"
        >
          Copy link
        </button>
      </div>
      <p role="status" className="text-xs text-gray-400 min-h-[1rem]">
        {status}
      </p>
    </div>
  );
}
