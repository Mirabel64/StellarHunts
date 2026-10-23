"use client";

/**
 * Reward History Page — Issue #738
 *
 * Displays all rewards earned by the authenticated player:
 *   - Points, NFTs, and badges, each with a timestamp
 *   - Filter by reward type (All / Points / NFT / Badge)
 *   - Paginated list (10 items per page)
 *   - CSV export of all filtered results
 *
 * API contract (backend):
 *   GET /api/v1/reward/user/:userId/claims
 *   Returns an array of RewardClaim objects each containing:
 *     { id, userId, challengeId, status, claimDate,
 *       reward: { id, name, description, type, metadata } }
 *
 * The page degrades gracefully when the API is unavailable, showing
 * skeleton loading states and a clear error banner.
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Pagination from "@/components/Pagination";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

/** All reward types the filter UI knows about. */
const REWARD_TYPES = ["all", "nft", "points", "badge", "token"];

const TYPE_LABELS = {
  all: "All Rewards",
  nft: "NFTs",
  points: "Points",
  badge: "Badges",
  token: "Tokens",
};

const TYPE_COLOURS = {
  nft:    "bg-purple-500/20 text-purple-300 border-purple-500/30",
  points: "bg-green-500/20  text-green-300  border-green-500/30",
  badge:  "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  token:  "bg-blue-500/20   text-blue-300   border-blue-500/30",
};

const TYPE_ICONS = {
  nft:    "🎨",
  points: "⭐",
  badge:  "🏅",
  token:  "🪙",
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Format an ISO date string as a human-readable local date/time.
 * Falls back to the raw string if the date is invalid.
 */
function formatDate(isoString) {
  if (!isoString) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}

/**
 * Convert an array of reward claim objects to a CSV string.
 * All fields are quoted to handle commas and special characters.
 */
function toCSV(claims) {
  const headers = ["ID", "Name", "Type", "Challenge ID", "Status", "Earned At"];
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = claims.map((c) => [
    escape(c.id),
    escape(c.reward?.name ?? ""),
    escape(c.reward?.type ?? ""),
    escape(c.challengeId ?? ""),
    escape(c.status ?? ""),
    escape(c.claimDate ?? ""),
  ]);
  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

/**
 * Trigger a browser download of `content` as a file named `filename`.
 */
function downloadCSV(content, filename) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LoadingRow() {
  return (
    <div className="animate-pulse flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/10">
      <div className="w-10 h-10 rounded-lg bg-white/10 flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 bg-white/10 rounded w-1/3" />
        <div className="h-2 bg-white/10 rounded w-1/2" />
      </div>
      <div className="h-6 w-16 bg-white/10 rounded-full" />
      <div className="h-2 w-28 bg-white/10 rounded hidden sm:block" />
    </div>
  );
}

function RewardRow({ claim }) {
  const type = (claim.reward?.type ?? "badge").toLowerCase();
  const icon = TYPE_ICONS[type] ?? "🎁";
  const colourClass =
    TYPE_COLOURS[type] ?? "bg-gray-500/20 text-gray-300 border-gray-500/30";

  return (
    <div
      className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl
                 bg-white/5 border border-white/10 hover:bg-white/10
                 transition-colors duration-200"
      role="row"
    >
      {/* Icon */}
      <div
        className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500/30 to-pink-500/30
                   flex items-center justify-center text-lg flex-shrink-0"
        aria-hidden="true"
      >
        {icon}
      </div>

      {/* Name + challenge */}
      <div className="flex-1 min-w-0">
        <p className="text-white font-medium truncate">
          {claim.reward?.name ?? "Unknown reward"}
        </p>
        {claim.challengeId && (
          <p className="text-gray-400 text-xs truncate mt-0.5">
            Challenge: {claim.challengeId}
          </p>
        )}
        {claim.reward?.description && (
          <p className="text-gray-400 text-xs truncate mt-0.5 hidden md:block">
            {claim.reward.description}
          </p>
        )}
      </div>

      {/* Type badge */}
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs
                    font-medium border flex-shrink-0 ${colourClass}`}
      >
        {type}
      </span>

      {/* Status */}
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs
                    font-medium flex-shrink-0
                    ${claim.status === "claimed"
                      ? "bg-green-500/20 text-green-300"
                      : "bg-gray-500/20 text-gray-300"}`}
      >
        {claim.status ?? "—"}
      </span>

      {/* Timestamp */}
      <time
        dateTime={claim.claimDate}
        className="text-gray-400 text-xs whitespace-nowrap flex-shrink-0"
      >
        {formatDate(claim.claimDate)}
      </time>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RewardHistoryPage() {
  // ── State ────────────────────────────────────────────────────────────
  const [allClaims, setAllClaims]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [selectedType, setSelectedType] = useState("all");
  const [currentPage, setCurrentPage]   = useState(1);
  const [exportLoading, setExportLoading] = useState(false);

  // ── Fetch reward history ─────────────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // In production the user ID comes from the auth store / session.
      // For demonstration we use a placeholder; replace with
      //   useAuthStore(state => state.user?.id)
      // once auth is wired up.
      const userId = "current-user"; // TODO: replace with auth store

      const res = await fetch(`${API_BASE}/reward/user/${userId}/claims`, {
        headers: { "Content-Type": "application/json" },
        // next: { revalidate: 60 } — client component so no cache hint
      });

      if (!res.ok) {
        throw new Error(`API error ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      // Normalise: the API may return the claims array directly or wrapped.
      const claims = Array.isArray(data) ? data : (data.claims ?? []);
      // Sort newest first
      claims.sort(
        (a, b) =>
          new Date(b.claimDate ?? 0).getTime() -
          new Date(a.claimDate ?? 0).getTime(),
      );
      setAllClaims(claims);
    } catch (err) {
      console.error("Failed to fetch reward history:", err);
      setError(err.message ?? "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Reset to page 1 when the filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedType]);

  // ── Derived data ──────────────────────────────────────────────────────
  const filteredClaims = useMemo(() => {
    if (selectedType === "all") return allClaims;
    return allClaims.filter(
      (c) => (c.reward?.type ?? "").toLowerCase() === selectedType,
    );
  }, [allClaims, selectedType]);

  const totalPages = Math.max(1, Math.ceil(filteredClaims.length / PAGE_SIZE));
  const safePage   = Math.min(currentPage, totalPages);

  const pagedClaims = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredClaims.slice(start, start + PAGE_SIZE);
  }, [filteredClaims, safePage]);

  // Type counts for filter button labels
  const typeCounts = useMemo(() => {
    const counts = { all: allClaims.length };
    for (const c of allClaims) {
      const t = (c.reward?.type ?? "badge").toLowerCase();
      counts[t] = (counts[t] ?? 0) + 1;
    }
    return counts;
  }, [allClaims]);

  // ── CSV export ────────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    setExportLoading(true);
    try {
      const csv      = toCSV(filteredClaims);
      const typeTag  = selectedType === "all" ? "all" : selectedType;
      const dateTag  = new Date().toISOString().slice(0, 10);
      downloadCSV(csv, `stellarhunts-rewards-${typeTag}-${dateTag}.csv`);
    } finally {
      setExportLoading(false);
    }
  }, [filteredClaims, selectedType]);

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-purple-900 to-black">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">

        {/* ── Header ───────────────────────────────────────────────── */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold bg-clip-text text-transparent
                         bg-gradient-to-r from-purple-400 to-pink-600 mb-2">
            Reward History
          </h1>
          <p className="text-gray-300 text-sm sm:text-base">
            All points, NFTs, and badges you&apos;ve earned on StellarHunts.
          </p>
        </div>

        {/* ── Stats strip ──────────────────────────────────────────── */}
        {!loading && !error && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {(["all", "nft", "points", "badge"] ).map((type) => (
              <div
                key={type}
                className="bg-white/5 border border-white/10 rounded-xl p-3 text-center"
              >
                <p className="text-2xl font-bold text-white">
                  {typeCounts[type] ?? 0}
                </p>
                <p className="text-gray-400 text-xs capitalize mt-0.5">
                  {TYPE_LABELS[type] ?? type}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* ── Filter bar + Export ───────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between
                        gap-3 mb-6">
          {/* Filter pills */}
          <div
            role="group"
            aria-label="Filter by reward type"
            className="flex flex-wrap gap-2"
          >
            {REWARD_TYPES.filter((t) => t === "all" || (typeCounts[t] ?? 0) > 0).map(
              (type) => {
                const isActive = selectedType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => setSelectedType(type)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                                border ${
                                  isActive
                                    ? "bg-purple-500 text-white border-purple-400"
                                    : "bg-white/5 text-gray-300 border-white/10 hover:bg-white/10"
                                }`}
                  >
                    {TYPE_ICONS[type] && type !== "all"
                      ? `${TYPE_ICONS[type]} `
                      : ""}
                    {TYPE_LABELS[type] ?? type}
                    {typeCounts[type] !== undefined && (
                      <span className="ml-1 opacity-70">({typeCounts[type]})</span>
                    )}
                  </button>
                );
              },
            )}
          </div>

          {/* Export button */}
          <button
            type="button"
            onClick={handleExport}
            disabled={exportLoading || filteredClaims.length === 0}
            aria-label="Export filtered rewards as CSV"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm
                       font-medium transition-colors
                       bg-gradient-to-r from-purple-500/30 to-pink-500/30
                       hover:from-purple-500/50 hover:to-pink-500/50
                       text-white border border-purple-500/30
                       disabled:opacity-40 disabled:cursor-not-allowed
                       flex-shrink-0"
          >
            {exportLoading ? (
              <span className="inline-block w-4 h-4 border-2 border-white/30
                               border-t-white rounded-full animate-spin"
                    aria-hidden="true" />
            ) : (
              <span aria-hidden="true">⬇️</span>
            )}
            Export CSV
          </button>
        </div>

        {/* ── Content area ─────────────────────────────────────────── */}
        {loading && (
          <div
            className="space-y-3"
            role="status"
            aria-label="Loading reward history"
          >
            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
              <LoadingRow key={i} />
            ))}
          </div>
        )}

        {!loading && error && (
          <div
            role="alert"
            className="rounded-xl bg-red-500/10 border border-red-500/30 p-6 text-center"
          >
            <p className="text-red-300 font-medium mb-1">
              Failed to load reward history
            </p>
            <p className="text-red-400 text-sm mb-4">{error}</p>
            <button
              type="button"
              onClick={fetchHistory}
              className="px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30
                         text-red-200 text-sm font-medium transition-colors"
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && filteredClaims.length === 0 && (
          <div
            className="rounded-xl bg-white/5 border border-white/10 p-12 text-center"
          >
            <p className="text-4xl mb-4" aria-hidden="true">🎁</p>
            <p className="text-white font-medium text-lg mb-2">
              {selectedType === "all"
                ? "No rewards yet"
                : `No ${TYPE_LABELS[selectedType] ?? selectedType} rewards yet`}
            </p>
            <p className="text-gray-400 text-sm">
              Complete puzzles to earn points, NFTs, and badges!
            </p>
          </div>
        )}

        {!loading && !error && filteredClaims.length > 0 && (
          <>
            {/* Result count */}
            <p
              className="text-gray-400 text-xs mb-3"
              aria-live="polite"
              aria-atomic="true"
            >
              Showing{" "}
              {(safePage - 1) * PAGE_SIZE + 1}–
              {Math.min(safePage * PAGE_SIZE, filteredClaims.length)} of{" "}
              {filteredClaims.length} reward
              {filteredClaims.length !== 1 ? "s" : ""}
            </p>

            {/* Reward rows */}
            <div
              className="space-y-3"
              role="table"
              aria-label="Reward history"
            >
              {pagedClaims.map((claim) => (
                <RewardRow key={claim.id} claim={claim} />
              ))}
            </div>

            {/* Pagination */}
            <Pagination
              currentPage={safePage}
              totalPages={totalPages}
              onPageChange={(p) => {
                setCurrentPage(p);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
