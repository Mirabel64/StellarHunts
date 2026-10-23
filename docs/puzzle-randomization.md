# Puzzle randomisation

Puzzles whose answer is the same for everyone get shared on Discord within
hours. Randomised puzzles give each player different parameters while keeping
validation deterministic.

## How it works

1. The seed is `HMAC-SHA256(secret, "<userId>:<puzzleId>")`. The server secret
   means players cannot precompute other players' instances.
2. Your `generate(rng)` function builds the prompt and the expected answer from
   a `SeededRandom`. Same seed, same sequence of numbers.
3. Validation recomputes the instance from the same seed and compares the
   normalised answer (`trim` + lower-case). No per-user answer is stored.

## Writing a randomised puzzle

```ts
import { PuzzleGenerator } from 'backend/src/puzzle/puzzle-randomization';

export const addition: PuzzleGenerator = (rng) => {
  const a = rng.int(10, 99);
  const b = rng.int(10, 99);
  return { prompt: `What is ${a} + ${b}?`, answer: a + b };
};
```

Rules for authors:

- Only draw randomness from `rng` (`rng.int`, `rng.pick`). Never use
  `Math.random()` or the current time: the instance must be reproducible.
- Always call `rng` in the same order so an instance does not change when the
  puzzle is re-validated.
- Keep the answer space large enough that guessing is impractical (and see the
  attempt limits in `puzzle-rate-limit.guard.ts`).
- Changing a generator changes every player's instance. Publish a new puzzle
  version instead of editing a live one.

## Using it

```ts
const instance = createPuzzleInstance(addition, userId, puzzleId, secret);
// show instance.prompt to the player
isCorrectAnswer(instance, submittedAnswer);
```
