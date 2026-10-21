#!/usr/bin/env node

/**
 * CI / Test validator for StellarHunts puzzle templates (issue #715).
 * Validates puzzle JSON fixtures against schemas/puzzle-template.schema.json
 * without requiring external npm dependencies.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const SCHEMA_PATH = path.join(ROOT_DIR, 'schemas', 'puzzle-template.schema.json');
const FIXTURES_DIR = path.join(ROOT_DIR, 'fixtures', 'puzzles');

const VALID_DIFFICULTIES = ['easy', 'medium', 'hard', 'master'];
const VALID_TYPES = ['text', 'number', 'math', 'multiple_choice', 'logic', 'code', 'image'];
const VALID_SOLUTION_TYPES = ['plain', 'sha256', 'regex', 'numeric_exact'];
const VALID_REWARD_TYPES = ['badge', 'nft', 'token', 'points'];
const VALID_LANGUAGES = ['rust', 'javascript', 'python', 'stellar-cli', 'bash'];

/**
 * Validates a puzzle object against schemas/puzzle-template.schema.json.
 * Returns an array of error messages (empty if valid).
 */
function validatePuzzleTemplate(puzzle, filePath = 'unknown') {
  const errors = [];

  if (!puzzle || typeof puzzle !== 'object' || Array.isArray(puzzle)) {
    return [`[${filePath}] Puzzle template must be a JSON object`];
  }

  // Required top-level fields
  const required = ['id', 'title', 'description', 'difficulty', 'type', 'content', 'solution'];
  for (const field of required) {
    if (puzzle[field] === undefined || puzzle[field] === null || puzzle[field] === '') {
      errors.push(`[${filePath}] Missing required property: "${field}"`);
    }
  }

  // ID validation
  if (typeof puzzle.id === 'string') {
    if (!/^[a-zA-Z0-9_-]+$/.test(puzzle.id)) {
      errors.push(`[${filePath}] "id" must match pattern ^[a-zA-Z0-9_-]+$ (got "${puzzle.id}")`);
    }
    if (puzzle.id.length > 128) {
      errors.push(`[${filePath}] "id" length exceeds 128 characters`);
    }
  } else if (puzzle.id !== undefined) {
    errors.push(`[${filePath}] "id" must be a string`);
  }

  // Title validation
  if (typeof puzzle.title === 'string') {
    if (puzzle.title.length > 255) {
      errors.push(`[${filePath}] "title" length exceeds 255 characters`);
    }
  }

  // Difficulty enum
  if (puzzle.difficulty && !VALID_DIFFICULTIES.includes(puzzle.difficulty)) {
    errors.push(`[${filePath}] Invalid "difficulty": "${puzzle.difficulty}". Allowed: ${VALID_DIFFICULTIES.join(', ')}`);
  }

  // Type enum
  if (puzzle.type && !VALID_TYPES.includes(puzzle.type)) {
    errors.push(`[${filePath}] Invalid "type": "${puzzle.type}". Allowed: ${VALID_TYPES.join(', ')}`);
  }

  // Content validation
  if (puzzle.content && typeof puzzle.content === 'object') {
    if (!puzzle.content.prompt || typeof puzzle.content.prompt !== 'string') {
      errors.push(`[${filePath}] "content.prompt" is required and must be a string`);
    }

    if (puzzle.type === 'multiple_choice') {
      if (!Array.isArray(puzzle.content.options) || puzzle.content.options.length < 2) {
        errors.push(`[${filePath}] multiple_choice puzzle requires "content.options" with at least 2 items`);
      }
    }

    if (puzzle.content.language && !VALID_LANGUAGES.includes(puzzle.content.language)) {
      errors.push(`[${filePath}] Invalid "content.language": "${puzzle.content.language}". Allowed: ${VALID_LANGUAGES.join(', ')}`);
    }
  } else if (puzzle.content !== undefined) {
    errors.push(`[${filePath}] "content" must be an object`);
  }

  // Solution
  if (puzzle.solution !== undefined && typeof puzzle.solution !== 'string') {
    errors.push(`[${filePath}] "solution" must be a string`);
  }

  if (puzzle.solutionType && !VALID_SOLUTION_TYPES.includes(puzzle.solutionType)) {
    errors.push(`[${filePath}] Invalid "solutionType": "${puzzle.solutionType}". Allowed: ${VALID_SOLUTION_TYPES.join(', ')}`);
  }

  // Optional Hint
  if (puzzle.hint !== undefined) {
    if (typeof puzzle.hint !== 'string') {
      errors.push(`[${filePath}] "hint" must be a string`);
    } else if (puzzle.hint.length > 2048) {
      errors.push(`[${filePath}] "hint" exceeds maximum length of 2048 characters`);
    }
  }

  // Optional Reward
  if (puzzle.reward !== undefined) {
    if (typeof puzzle.reward !== 'object' || Array.isArray(puzzle.reward)) {
      errors.push(`[${filePath}] "reward" must be an object`);
    } else {
      if (puzzle.reward.type && !VALID_REWARD_TYPES.includes(puzzle.reward.type)) {
        errors.push(`[${filePath}] Invalid "reward.type": "${puzzle.reward.type}". Allowed: ${VALID_REWARD_TYPES.join(', ')}`);
      }
    }
  }

  // Version
  if (puzzle.version !== undefined && (!Number.isInteger(puzzle.version) || puzzle.version < 1)) {
    errors.push(`[${filePath}] "version" must be an integer >= 1`);
  }

  return errors;
}

function runValidation() {
  console.log('--- Validating Puzzle Templates Against JSON Schema ---');
  if (!fs.existsSync(SCHEMA_PATH)) {
    console.error(`Error: Schema file not found at ${SCHEMA_PATH}`);
    process.exit(1);
  }

  // Verify schema itself is valid JSON
  try {
    JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
    console.log(`✓ JSON schema ${path.relative(ROOT_DIR, SCHEMA_PATH)} is valid JSON`);
  } catch (err) {
    console.error(`✗ Schema JSON error: ${err.message}`);
    process.exit(1);
  }

  if (!fs.existsSync(FIXTURES_DIR)) {
    console.error(`Error: Fixtures directory not found at ${FIXTURES_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.json'));
  if (files.length === 0) {
    console.error(`Error: No puzzle fixtures found in ${FIXTURES_DIR}`);
    process.exit(1);
  }

  let totalErrors = [];

  for (const file of files) {
    const filePath = path.join(FIXTURES_DIR, file);
    try {
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const errors = validatePuzzleTemplate(content, file);
      if (errors.length > 0) {
        console.error(`✗ ${file}:`);
        errors.forEach((err) => console.error(`    - ${err}`));
        totalErrors.push(...errors);
      } else {
        console.log(`✓ ${file} passed schema validation (id: ${content.id}, type: ${content.type}, difficulty: ${content.difficulty})`);
      }
    } catch (err) {
      const msg = `[${file}] JSON Parse Error: ${err.message}`;
      console.error(`✗ ${msg}`);
      totalErrors.push(msg);
    }
  }

  // Also validate that migration output satisfies the schema
  const { migratePuzzle } = require('./migrate-puzzles');
  const testLegacy = {
    id: 'test-migrated-puzzle',
    title: 'Migrated Test Puzzle',
    description: 'Verifying migrated puzzle validity against JSON schema',
    difficulty: 'easy',
    type: 'multiple_choice',
    options: ['Choice 1', 'Choice 2'],
    solution: 'Choice 1',
  };
  const migrated = migratePuzzle(testLegacy);
  const migrationErrors = validatePuzzleTemplate(migrated, 'migration-verification');
  if (migrationErrors.length > 0) {
    console.error('✗ Migration output failed schema validation:');
    migrationErrors.forEach((e) => console.error(`    - ${e}`));
    totalErrors.push(...migrationErrors);
  } else {
    console.log('✓ Migration output passed schema validation');
  }

  if (totalErrors.length > 0) {
    console.error(`\nValidation failed with ${totalErrors.length} error(s).`);
    process.exit(1);
  }

  console.log(`\nAll ${files.length} puzzle fixtures + migration outputs passed validation successfully.`);
}

if (require.main === module) {
  runValidation();
}

module.exports = {
  validatePuzzleTemplate,
  runValidation,
};
