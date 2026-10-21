import { createHash } from 'crypto';
import { CRYPTOGRAPHY_PUZZLES } from './cryptography-puzzles';

describe('cryptography puzzle set', () => {
  it('has at least five puzzles with unique titles', () => {
    expect(CRYPTOGRAPHY_PUZZLES.length).toBeGreaterThanOrEqual(5);
    const titles = new Set(CRYPTOGRAPHY_PUZZLES.map((p) => p.title));
    expect(titles.size).toBe(CRYPTOGRAPHY_PUZZLES.length);
  });

  it('reveals hints progressively (at least two per puzzle)', () => {
    for (const puzzle of CRYPTOGRAPHY_PUZZLES) {
      expect(puzzle.hints.length).toBeGreaterThanOrEqual(2);
      expect(new Set(puzzle.hints).size).toBe(puzzle.hints.length);
      for (const hint of puzzle.hints) {
        expect(hint.toLowerCase()).not.toContain(puzzle.solution.toLowerCase());
      }
    }
  });

  it('explains each answer with a real cryptography reference', () => {
    const terms = /(SHA-256|Ed25519|strkey|hash)/i;
    for (const puzzle of CRYPTOGRAPHY_PUZZLES) {
      expect(puzzle.explanation).toMatch(terms);
    }
  });

  it('has correct hash solutions', () => {
    const sha = (text: string) =>
      createHash('sha256').update(text).digest('hex').slice(0, 8);
    const bySolution = (title: string) =>
      CRYPTOGRAPHY_PUZZLES.find((p) => p.title === title)!.solution;
    expect(bySolution('Fingerprint of "abc"')).toBe(sha('abc'));
    expect(bySolution('Hello, hash')).toBe(sha('hello'));
  });
});
