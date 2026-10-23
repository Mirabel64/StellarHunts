export interface PuzzleSubmissionAttempt {
  userId: string;
  puzzleId: string;
  timestamp: number;
}

export interface AttemptDecision {
  allowed: boolean;
  /** Attempts left in the current hour (0 when blocked). */
  remaining: number;
  /** Milliseconds until another attempt is allowed (0 when allowed). */
  retryAfterMs: number;
}

export interface AttemptLimitOptions {
  /** Attempts allowed per rolling hour. Env: PUZZLE_MAX_ATTEMPTS_PER_HOUR. */
  maxAttemptsPerHour: number;
  /** First lockout after the limit is exceeded. Doubles on every repeat. */
  baseBackoffMs: number;
  /** Upper bound for a single lockout. */
  maxBackoffMs: number;
}

const HOUR_MS = 60 * 60 * 1000;

export function attemptLimitOptionsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AttemptLimitOptions {
  const max = Number(env.PUZZLE_MAX_ATTEMPTS_PER_HOUR);
  return {
    maxAttemptsPerHour: Number.isFinite(max) && max > 0 ? Math.floor(max) : 10,
    baseBackoffMs: 30_000,
    maxBackoffMs: HOUR_MS,
  };
}

interface AttemptState {
  timestamps: number[];
  violations: number;
  blockedUntil: number;
}

/**
 * Anti-brute-force limiter for puzzle answers (issue #725): a configurable
 * number of attempts per hour per user and puzzle, then an exponentially
 * growing lockout (30s, 60s, 120s, ... capped).
 */
export class PuzzleRateLimitGuard {
  private readonly states = new Map<string, AttemptState>();

  constructor(
    private readonly options: AttemptLimitOptions = attemptLimitOptionsFromEnv(),
  ) {}

  /** Records an attempt and says whether it may proceed. */
  public checkAttempt(
    userId: string,
    puzzleId: string,
    now: number = Date.now(),
  ): AttemptDecision {
    const key = `${userId}:${puzzleId}`;
    const state = this.states.get(key) ?? {
      timestamps: [],
      violations: 0,
      blockedUntil: 0,
    };

    if (state.blockedUntil > now) {
      return { allowed: false, remaining: 0, retryAfterMs: state.blockedUntil - now };
    }

    state.timestamps = state.timestamps.filter((ts) => now - ts < HOUR_MS);

    if (state.timestamps.length >= this.options.maxAttemptsPerHour) {
      const backoff = Math.min(
        this.options.baseBackoffMs * 2 ** state.violations,
        this.options.maxBackoffMs,
      );
      state.violations += 1;
      state.blockedUntil = now + backoff;
      this.states.set(key, state);
      return { allowed: false, remaining: 0, retryAfterMs: backoff };
    }

    state.timestamps.push(now);
    this.states.set(key, state);
    return {
      allowed: true,
      remaining: this.options.maxAttemptsPerHour - state.timestamps.length,
      retryAfterMs: 0,
    };
  }

  /** Clears the counters for a user and puzzle, e.g. after a correct answer. */
  public reset(userId: string, puzzleId: string): void {
    this.states.delete(`${userId}:${puzzleId}`);
  }

  /** Legacy boolean API: `limit` attempts per `windowMs`, no backoff. */
  public checkRateLimit(
    userId: string,
    puzzleId: string,
    limit: number = 5,
    windowMs: number = 60000,
  ): boolean {
    const key = `legacy:${userId}:${puzzleId}`;
    const now = Date.now();
    const state = this.states.get(key) ?? {
      timestamps: [],
      violations: 0,
      blockedUntil: 0,
    };
    state.timestamps = state.timestamps.filter((ts) => now - ts < windowMs);
    if (state.timestamps.length >= limit) {
      this.states.set(key, state);
      return false;
    }
    state.timestamps.push(now);
    this.states.set(key, state);
    return true;
  }
}
