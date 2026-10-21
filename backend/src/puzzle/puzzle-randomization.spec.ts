import {
  PuzzleGenerator,
  SeededRandom,
  createPuzzleInstance,
  deriveSeed,
  isCorrectAnswer,
} from './puzzle-randomization';

const SECRET = 'test-secret';

const additionPuzzle: PuzzleGenerator = (rng) => {
  const a = rng.int(10, 99);
  const b = rng.int(10, 99);
  return { prompt: `What is ${a} + ${b}?`, answer: a + b };
};

describe('puzzle randomisation', () => {
  it('derives the same seed for the same user and puzzle', () => {
    expect(deriveSeed('u1', 'p1', SECRET)).toBe(deriveSeed('u1', 'p1', SECRET));
  });

  it('derives different seeds for different users or puzzles', () => {
    expect(deriveSeed('u1', 'p1', SECRET)).not.toBe(deriveSeed('u2', 'p1', SECRET));
    expect(deriveSeed('u1', 'p1', SECRET)).not.toBe(deriveSeed('u1', 'p2', SECRET));
  });

  it('produces a deterministic instance for a given player', () => {
    const first = createPuzzleInstance(additionPuzzle, 'u1', 'p1', SECRET);
    const second = createPuzzleInstance(additionPuzzle, 'u1', 'p1', SECRET);
    expect(first).toEqual(second);
  });

  it('gives different players different parameters', () => {
    const prompts = new Set(
      Array.from({ length: 20 }, (_, i) =>
        createPuzzleInstance(additionPuzzle, `user-${i}`, 'p1', SECRET).prompt,
      ),
    );
    expect(prompts.size).toBeGreaterThan(10);
  });

  it('validates answers deterministically', () => {
    const instance = createPuzzleInstance(additionPuzzle, 'u1', 'p1', SECRET);
    expect(isCorrectAnswer(instance, instance.answer)).toBe(true);
    expect(isCorrectAnswer(instance, ` ${instance.answer} `)).toBe(true);
    expect(isCorrectAnswer(instance, Number(instance.answer) + 1)).toBe(false);
  });

  it('keeps integers within the requested range', () => {
    const rng = new SeededRandom('seed');
    for (let i = 0; i < 200; i++) {
      const n = rng.int(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
    }
  });

  it('rejects invalid ranges and empty picks', () => {
    const rng = new SeededRandom('seed');
    expect(() => rng.int(5, 1)).toThrow(RangeError);
    expect(() => rng.pick([])).toThrow(RangeError);
  });
});
