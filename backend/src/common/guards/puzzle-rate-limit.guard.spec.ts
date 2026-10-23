import { PuzzleRateLimitGuard } from './puzzle-rate-limit.guard';

const options = { maxAttemptsPerHour: 3, baseBackoffMs: 1_000, maxBackoffMs: 8_000 };

describe('PuzzleRateLimitGuard', () => {
  it('allows the configured number of attempts per hour', () => {
    const guard = new PuzzleRateLimitGuard(options);
    expect(guard.checkAttempt('u', 'p', 0)).toMatchObject({ allowed: true, remaining: 2 });
    expect(guard.checkAttempt('u', 'p', 1)).toMatchObject({ allowed: true, remaining: 1 });
    expect(guard.checkAttempt('u', 'p', 2)).toMatchObject({ allowed: true, remaining: 0 });
    const blocked = guard.checkAttempt('u', 'p', 3);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(1_000);
  });

  it('keeps blocking until the lockout ends, then backs off exponentially', () => {
    const guard = new PuzzleRateLimitGuard(options);
    for (let t = 0; t < 3; t++) guard.checkAttempt('u', 'p', t);

    expect(guard.checkAttempt('u', 'p', 10).retryAfterMs).toBe(1_000); // 1st lockout
    expect(guard.checkAttempt('u', 'p', 500).allowed).toBe(false); // still locked
    expect(guard.checkAttempt('u', 'p', 1_011).retryAfterMs).toBe(2_000); // 2nd
    expect(guard.checkAttempt('u', 'p', 3_100).retryAfterMs).toBe(4_000); // 3rd
    expect(guard.checkAttempt('u', 'p', 7_200).retryAfterMs).toBe(8_000); // 4th
    expect(guard.checkAttempt('u', 'p', 15_300).retryAfterMs).toBe(8_000); // capped
  });

  it('allows attempts again once the hour window has passed', () => {
    const guard = new PuzzleRateLimitGuard(options);
    for (let t = 0; t < 3; t++) guard.checkAttempt('u', 'p', t);
    expect(guard.checkAttempt('u', 'p', 60 * 60 * 1000 + 10_000).allowed).toBe(true);
  });

  it('tracks users and puzzles independently', () => {
    const guard = new PuzzleRateLimitGuard(options);
    for (let t = 0; t < 4; t++) guard.checkAttempt('u1', 'p', t);
    expect(guard.checkAttempt('u2', 'p', 5).allowed).toBe(true);
    expect(guard.checkAttempt('u1', 'other', 5).allowed).toBe(true);
  });

  it('reset clears the counters', () => {
    const guard = new PuzzleRateLimitGuard(options);
    for (let t = 0; t < 4; t++) guard.checkAttempt('u', 'p', t);
    guard.reset('u', 'p');
    expect(guard.checkAttempt('u', 'p', 5).allowed).toBe(true);
  });
});
