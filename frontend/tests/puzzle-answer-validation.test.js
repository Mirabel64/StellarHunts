import { describe, expect, it } from "vitest";
import {
  getPuzzleAnswerOptions,
  getPuzzleAnswerType,
  validatePuzzleAnswer,
} from "@/lib/puzzle-answer";

describe("puzzle answer validation", () => {
  it("defaults puzzles without a type to text", () => {
    expect(getPuzzleAnswerType({})).toBe("text");
    expect(validatePuzzleAnswer("answer", {})).toBeNull();
  });

  it("requires numeric answers for math and number puzzles", () => {
    expect(validatePuzzleAnswer("12.5", { content: { type: "math" } })).toBeNull();
    expect(validatePuzzleAnswer("-12", { type: "number" })).toBeNull();
    expect(validatePuzzleAnswer("twelve", { type: "number" })).toBe(
      "Enter a valid number.",
    );
  });

  it("requires a multiple-choice answer to match a listed option", () => {
    const puzzle = {
      content: {
        type: "multiple_choice",
        options: ["First", "Second"],
      },
    };

    expect(getPuzzleAnswerOptions(puzzle)).toEqual(["First", "Second"]);
    expect(validatePuzzleAnswer("Second", puzzle)).toBeNull();
    expect(validatePuzzleAnswer("Other", puzzle)).toBe(
      "Choose one of the available options.",
    );
    expect(
      validatePuzzleAnswer("First", {
        type: "multiple_choice",
        options: [],
      }),
    ).toBe("This multiple-choice puzzle has no available options.");
  });

  it("rejects empty, oversized, null-containing, and unsupported answers", () => {
    expect(validatePuzzleAnswer("   ", {})).toBe(
      "Enter an answer before submitting.",
    );
    expect(validatePuzzleAnswer("a".repeat(4097), {})).toMatch(/4096/);
    expect(validatePuzzleAnswer("bad\0answer", {})).toMatch(/null characters/);
    expect(validatePuzzleAnswer("answer", { type: "unknown" })).toMatch(
      /unsupported answer format/,
    );
  });
});
