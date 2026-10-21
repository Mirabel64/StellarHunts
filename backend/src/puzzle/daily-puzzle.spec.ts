import {
  DAILY_BONUS_XP,
  DailyBonusLedger,
  pickDailyPuzzleId,
  utcDayKey,
} from './daily-puzzle';

describe('daily puzzle', () => {
  const ids = ['b', 'c', 'a', 'd'];

  it('uses the UTC date as the day key', () => {
    expect(utcDayKey(new Date('2025-03-07T23:59:59Z'))).toBe('2025-03-07');
    expect(utcDayKey(new Date('2025-03-08T00:00:00Z'))).toBe('2025-03-08');
  });

  it('picks the same puzzle all day and independent of id order', () => {
    const morning = pickDailyPuzzleId(ids, new Date('2025-03-07T00:00:01Z'));
    const night = pickDailyPuzzleId([...ids].reverse(), new Date('2025-03-07T23:59:59Z'));
    expect(morning).toBe(night);
    expect(ids).toContain(morning);
  });

  it('can change at UTC midnight', () => {
    const picks = new Set(
      Array.from({ length: 30 }, (_, i) =>
        pickDailyPuzzleId(ids, new Date(Date.UTC(2025, 2, 1 + i))),
      ),
    );
    expect(picks.size).toBeGreaterThan(1);
  });

  it('returns null when there are no puzzles', () => {
    expect(pickDailyPuzzleId([], new Date())).toBeNull();
  });

  it('grants the bonus only once per user per day', () => {
    const ledger = new DailyBonusLedger();
    expect(DAILY_BONUS_XP).toBeGreaterThan(0);
    expect(ledger.claim('u1', '2025-03-07')).toBe(true);
    expect(ledger.claim('u1', '2025-03-07')).toBe(false);
    expect(ledger.claim('u2', '2025-03-07')).toBe(true);
    expect(ledger.claim('u1', '2025-03-08')).toBe(true);
  });
});
