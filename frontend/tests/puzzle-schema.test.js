import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { validatePuzzleTemplate } from "../../scripts/validate-puzzle-schema";
import { migratePuzzle, migratePuzzles } from "../../scripts/migrate-puzzles";

describe("Puzzle Template Format & Migration (Issue #715)", () => {
  const rootDir = path.resolve(__dirname, "../..");
  const schemaPath = path.join(rootDir, "schemas", "puzzle-template.schema.json");
  const fixturesDir = path.join(rootDir, "fixtures", "puzzles");

  it("has a valid JSON schema definition", () => {
    expect(fs.existsSync(schemaPath)).toBe(true);
    const schemaContent = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
    expect(schemaContent.$schema).toBeDefined();
    expect(schemaContent.title).toBe("StellarHunts Puzzle Template");
    expect(schemaContent.required).toEqual(
      expect.arrayContaining(["id", "title", "description", "difficulty", "type", "content", "solution"]),
    );
  });

  it("validates all example fixtures against the schema", () => {
    expect(fs.existsSync(fixturesDir)).toBe(true);
    const files = fs.readdirSync(fixturesDir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThanOrEqual(3);

    for (const file of files) {
      const fixture = JSON.parse(fs.readFileSync(path.join(fixturesDir, file), "utf8"));
      const errors = validatePuzzleTemplate(fixture, file);
      expect(errors).toEqual([]);
    }
  });

  it("migrates legacy database puzzles to schema-compliant format", () => {
    const legacyDbPuzzle = {
      id: "legacy-db-123",
      title: "Legacy Cryptography Challenge",
      description: "Hash checking challenge from SQL db",
      difficulty: "HARD",
      solution: "0x1234567890abcdef",
      hint: "Use SHA-256",
      rewardId: "rew-uuid-001",
      isActive: true,
    };

    const migrated = migratePuzzle(legacyDbPuzzle);

    expect(migrated.id).toBe("legacy-db-123");
    expect(migrated.difficulty).toBe("hard");
    expect(migrated.type).toBe("text");
    expect(migrated.content.prompt).toBe("Hash checking challenge from SQL db");
    expect(migrated.reward.rewardId).toBe("rew-uuid-001");
    expect(migrated.version).toBe(1);

    const errors = validatePuzzleTemplate(migrated, "migrated-db-test");
    expect(errors).toEqual([]);
  });

  it("migrates legacy multiple-choice questions correctly", () => {
    const legacyMcq = {
      title: "Consensus Mechanism",
      summary: "Select the correct consensus engine",
      level: "intermediate",
      type: "multiple_choice",
      options: ["Proof of Stake", "Federated Byzantine Agreement"],
      answer: "Federated Byzantine Agreement",
    };

    const migrated = migratePuzzle(legacyMcq);

    expect(migrated.difficulty).toBe("medium");
    expect(migrated.type).toBe("multiple_choice");
    expect(migrated.content.options).toEqual(["Proof of Stake", "Federated Byzantine Agreement"]);
    expect(migrated.solution).toBe("Federated Byzantine Agreement");

    const errors = validatePuzzleTemplate(migrated, "migrated-mcq-test");
    expect(errors).toEqual([]);
  });

  it("catches schema violations when required fields are missing", () => {
    const invalidPuzzle = {
      id: "missing-fields",
      title: "Broken",
      // Missing description, difficulty, type, content, solution
    };

    const errors = validatePuzzleTemplate(invalidPuzzle, "invalid-test");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('Missing required property: "description"'))).toBe(true);
    expect(errors.some((e) => e.includes('Missing required property: "difficulty"'))).toBe(true);
  });
});
