"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * SeasonalRewardBanner
 * --------------------
 * Displays the current season status, active reward multiplier, and a
 * live countdown to the next reward halving.
 *
 * Props:
 *  @prop {string}  apiBase   – Base URL for the backend API, e.g. "/api/v1"
 *  @prop {boolean} [compact] – Render a slim single-line variant
 *
 * The component fetches season info from GET {apiBase}/rewards/season and
 * polls every 60 seconds to pick up schedule changes without requiring a
 * full page reload.
 */

const POLL_INTERVAL_MS = 60_000;

function formatCountdown(targetDate) {
  const now = Date.now();
  const diff = new Date(targetDate).getTime() - now;
  if (diff <= 0) return "Now";
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(" ");
}

function MultiplierBadge({ multiplier }) {
  const isBonus = multiplier > 1.0;
  const isHalved = multiplier < 1.0;
  const color = isBonus
    ? "bg-green-500/20 text-green-300 border border-green-500/40"
    : isHalved
    ? "bg-orange-500/20 text-orange-300 border border-orange-500/40"
    : "bg-blue-500/20 text-blue-300 border border-blue-500/40";

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}
      aria-label={`Reward multiplier: ${multiplier}×`}
    >
      {isBonus ? "🚀" : isHalved ? "📉" : "⚡"}
      {multiplier}×
    </span>
  );
}

function CountdownClock({ targetDate }) {
  const [display, setDisplay] = useState(() => formatCountdown(targetDate));

  useEffect(() => {
    setDisplay(formatCountdown(targetDate));
    const timer = setInterval(() => {
      setDisplay(formatCountdown(targetDate));
    }, 1000);
    return () => clearInterval(timer);
  }, [targetDate]);

  return (
    <span
      className="font-mono tabular-nums"
      aria-live="polite"
      aria-label={`Countdown: ${display}`}
    >
      {display}
    </span>
  );
}

export function SeasonalRewardBanner({ apiBase = "/api/v1", compact = false }) {
  const [seasonInfo, setSeasonInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSeasonInfo = useCallback(async () => {
    try {
      const resp = await fetch(`${apiBase}/rewards/season`, {
        headers: { "Content-Type": "application/json" },
        // include credentials so the auth cookie travels with the request
        credentials: "include",
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      setSeasonInfo(data);
      setError(null);
    } catch (err) {
      setError(err.message ?? "Failed to load season info");
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    fetchSeasonInfo();
    const interval = setInterval(fetchSeasonInfo, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchSeasonInfo]);

  // Don't render anything while loading to avoid layout shift
  if (loading) return null;

  // Soft failure: render nothing rather than a broken banner
  if (error || !seasonInfo) return null;

  const {
    season,
    multiplier = 1.0,
    nextHalvingDate,
    nextHalvingMultiplier,
    announcement,
  } = seasonInfo;

  // If there's no active season and multiplier is the base, skip the banner
  if (!season && multiplier === 1.0 && !announcement) return null;

  if (compact) {
    return (
      <div
        role="banner"
        aria-label="Seasonal reward status"
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-900/40 border border-indigo-500/30 text-sm text-indigo-200"
      >
        {season && (
          <span className="font-medium truncate max-w-[10rem]">
            {season.name}
          </span>
        )}
        <MultiplierBadge multiplier={multiplier} />
        {nextHalvingDate && (
          <span className="text-xs text-indigo-400 ml-auto whitespace-nowrap">
            Next halving: <CountdownClock targetDate={nextHalvingDate} />
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      role="banner"
      aria-label="Seasonal reward banner"
      className="w-full rounded-xl bg-gradient-to-r from-indigo-900/60 via-purple-900/50 to-indigo-900/60 border border-indigo-500/30 backdrop-blur-sm p-4"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {/* Season name + multiplier */}
        <div className="flex items-center gap-3">
          <span className="text-2xl select-none" aria-hidden="true">
            🏆
          </span>
          <div>
            {season ? (
              <p className="font-semibold text-white leading-tight">
                {season.name}
              </p>
            ) : (
              <p className="font-semibold text-white leading-tight">
                Active Season
              </p>
            )}
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-sm text-indigo-300">Reward rate:</span>
              <MultiplierBadge multiplier={multiplier} />
            </div>
          </div>
        </div>

        {/* Countdown to next halving */}
        {nextHalvingDate && (
          <div className="flex flex-col items-start sm:items-end">
            <span className="text-xs text-indigo-400 uppercase tracking-wide font-medium">
              Next halving
            </span>
            <span className="text-sm text-white font-semibold">
              <CountdownClock targetDate={nextHalvingDate} />
            </span>
            {nextHalvingMultiplier != null && (
              <span className="text-xs text-indigo-400">
                → {nextHalvingMultiplier}× rate
              </span>
            )}
          </div>
        )}
      </div>

      {/* Announcement text */}
      {announcement && (
        <p className="mt-2 text-sm text-indigo-200 leading-snug">
          {announcement}
        </p>
      )}
    </div>
  );
}

export default SeasonalRewardBanner;