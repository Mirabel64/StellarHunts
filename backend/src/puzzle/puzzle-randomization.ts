import { createHmac } from 'crypto';

/**
 * Per-user puzzle randomisation (issue #729).
 *
 * A puzzle author writes a `generate(rng)` function that builds the prompt and
 * the expected answer from a seeded random source. The seed is derived from
 * the player and the puzzle, so:
 *   - every player sees different parameters (shared answers are useless);
 *   - the same player always gets the same instance (validation is
 *     deterministic and needs no stored per-user state).
 */

/** Seeded, deterministic random source built on HMAC-SHA256. */
export class SeededRandom {
  private counter = 0;

  constructor(private readonly seed: string) {}

  /** Next integer in [min, max] (inclusive). */
  int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`Invalid range [${min}, ${max}]`);
    }
    const digest = createHmac('sha256', this.seed)
      .update(String(this.counter++))
      .digest();
    // 48 bits is plenty of entropy for any puzzle parameter range.
    const value = digest.readUIntBE(0, 6);
    return min + (value % (max - min + 1));
  }

  /** Picks one element of a non-empty array. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('Cannot pick from an empty list');
    return items[this.int(0, items.length - 1)];
  }
}

/** Derives the seed from the player and puzzle, keyed with a server secret. */
export function deriveSeed(
  userId: string,
  puzzleId: string,
  secret: string,
): string {
  return createHmac('sha256', secret)
    .update(`${userId}:${puzzleId}`)
    .digest('hex');
}

export interface PuzzleInstance {
  prompt: string;
  /** Expected answer, already normalised with {@link normaliseAnswer}. */
  answer: string;
}

export type PuzzleGenerator = (rng: SeededRandom) => {
  prompt: string;
  answer: string | number;
};

export function normaliseAnswer(value: string | number): string {
  return String(value).trim().toLowerCase();
}

/** Builds the player's instance of a puzzle. Same inputs, same instance. */
export function createPuzzleInstance(
  generate: PuzzleGenerator,
  userId: string,
  puzzleId: string,
  secret: string,
): PuzzleInstance {
  const rng = new SeededRandom(deriveSeed(userId, puzzleId, secret));
  const { prompt, answer } = generate(rng);
  return { prompt, answer: normaliseAnswer(answer) };
}

/** Deterministic validation of a submitted answer against the player's instance. */
export function isCorrectAnswer(
  instance: PuzzleInstance,
  submitted: string | number,
): boolean {
  return normaliseAnswer(submitted) === instance.answer;
}
