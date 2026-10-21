import { createHash } from 'crypto';

/** Bonus XP granted for solving the featured puzzle (once per UTC day). */
export const DAILY_BONUS_XP = 50;

/** The UTC calendar day, e.g. "2025-03-07". The puzzle rotates at UTC midnight. */
export function utcDayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Picks the featured puzzle for a day. The choice depends only on the day key
 * and the (sorted) puzzle ids, so every server instance agrees without any
 * stored state, and it changes exactly at UTC midnight.
 */
export function pickDailyPuzzleId(
  puzzleIds: readonly string[],
  date: Date = new Date(),
): string | null {
  if (puzzleIds.length === 0) return null;
  const sorted = [...puzzleIds].sort();
  const digest = createHash('sha256').update(utcDayKey(date)).digest();
  return sorted[digest.readUInt32BE(0) % sorted.length];
}

/**
 * Tracks who already received today's bonus. In-memory: it prevents repeat
 * bonuses within a process; persist it with the reward ledger for
 * multi-instance deployments.
 */
export class DailyBonusLedger {
  private readonly claimed = new Set<string>();

  /** Returns true the first time a user claims on a given day, false after. */
  claim(userId: string, dayKey: string = utcDayKey()): boolean {
    const key = `${dayKey}:${userId}`;
    if (this.claimed.has(key)) return false;
    this.claimed.add(key);
    return true;
  }

  /** Drops entries for days other than `dayKey` so the set stays small. */
  prune(dayKey: string = utcDayKey()): void {
    for (const key of this.claimed) {
      if (!key.startsWith(`${dayKey}:`)) this.claimed.delete(key);
    }
  }
}
