#!/usr/bin/env node

/**
 * Migration tool for StellarHunts puzzles (issue #715).
 * Converts legacy puzzle formats (DB records, drafts, frontend fixtures)
 * into standardized puzzle template JSON documents conforming to
 * schemas/puzzle-template.schema.json.
 */

const fs = require('fs');
const path = require('path');

const VALID_DIFFICULTIES = ['easy', 'medium', 'hard', 'master'];
const VALID_TYPES = ['text', 'number', 'math', 'multiple_choice', 'logic', 'code', 'image'];

/**
 * Normalizes and converts a legacy puzzle record into a compliant PuzzleTemplate object.
 *
 * @param {object} legacy - The legacy puzzle object.
 * @returns {object} Standardized puzzle template compliant with JSON schema.
 */
function migratePuzzle(legacy) {
  if (!legacy || typeof legacy !== 'object') {
    throw new Error('Invalid legacy puzzle: expected an object.');
  }

  // 1. Sanitize ID
  let id = String(legacy.id || legacy.puzzleId || legacy.slug || legacy.title || 'puzzle')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (!id) {
    id = `puzzle-${Date.now()}`;
  }

  // 2. Title & Description
  const title = String(legacy.title || 'Untitled Puzzle').trim().slice(0, 255);
  const description = String(legacy.description || legacy.summary || title).trim();

  // 3. Difficulty
  let difficulty = String(legacy.difficulty || legacy.level || 'easy').toLowerCase().trim();
  if (!VALID_DIFFICULTIES.includes(difficulty)) {
    if (difficulty === 'beginner') difficulty = 'easy';
    else if (difficulty === 'intermediate') difficulty = 'medium';
    else if (difficulty === 'advanced') difficulty = 'hard';
    else if (difficulty === 'expert') difficulty = 'master';
    else difficulty = 'easy';
  }

  // 4. Type & Content
  let type = String(legacy.type || legacy.puzzleType || legacy.content?.type || 'text').toLowerCase().trim();
  if (!VALID_TYPES.includes(type)) {
    type = 'text';
  }

  const prompt = String(
    legacy.content?.prompt ||
    legacy.prompt ||
    legacy.question ||
    legacy.description ||
    title
  ).trim();

  const content = { prompt };

  if (type === 'multiple_choice') {
    const rawOptions = legacy.content?.options || legacy.options || legacy.choices;
    if (Array.isArray(rawOptions) && rawOptions.length >= 2) {
      content.options = rawOptions.map(String);
    } else {
      // Fallback valid options if legacy data was incomplete
      content.options = ['Option A', 'Option B'];
    }
  }

  if (legacy.content?.initialCode || legacy.initialCode) {
    content.initialCode = String(legacy.content?.initialCode || legacy.initialCode);
  }
  if (legacy.content?.language || legacy.language) {
    content.language = String(legacy.content?.language || legacy.language);
  }
  if (legacy.content?.imageUrl || legacy.imageUrl) {
    content.imageUrl = String(legacy.content?.imageUrl || legacy.imageUrl);
  }

  // 5. Solution
  const solution = String(
    legacy.solution ||
    legacy.content?.answer ||
    legacy.answer ||
    legacy.hashed_answer ||
    'solution'
  ).trim();

  const solutionType = legacy.solutionType || (legacy.hashed_answer ? 'sha256' : 'plain');

  // 6. Build the template object
  const template = {
    version: 1,
    id,
    title,
    description,
    difficulty,
    type,
    content,
    solution,
    solutionType,
    isActive: legacy.isActive !== undefined ? Boolean(legacy.isActive) : true,
  };

  if (legacy.hint) {
    template.hint = String(legacy.hint).trim().slice(0, 2048);
  }

  if (legacy.rewardId || legacy.reward) {
    template.reward = {
      rewardId: String(legacy.rewardId || legacy.reward?.rewardId || legacy.reward?.id),
      type: legacy.reward?.type || 'badge',
      metadata: legacy.reward?.metadata || {},
    };
  }

  if (legacy.author) {
    template.author = String(legacy.author).trim().slice(0, 100);
  }

  if (Array.isArray(legacy.tags)) {
    template.tags = legacy.tags.map(String);
  }

  return template;
}

/**
 * Migrates a batch of existing puzzle records.
 */
function migratePuzzles(legacyList) {
  if (!Array.isArray(legacyList)) {
    throw new Error('Expected an array of legacy puzzles');
  }
  return legacyList.map(migratePuzzle);
}

// CLI Execution support
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('StellarHunts Puzzle Migration Tool');
    console.log('Usage: node scripts/migrate-puzzles.js <inputFile.json> [outputFile.json]');

    // Run self-test demonstration with legacy sample
    const legacySamples = [
      {
        id: 'legacy-db-001',
        title: 'Legacy DB Puzzle',
        description: 'A legacy puzzle from the SQL database',
        difficulty: 'EASY',
        hint: 'Use the explorer',
        solution: '42',
        rewardId: 'rew-100',
        isActive: true,
      },
      {
        title: 'Legacy Multiple Choice Question',
        description: 'Choose the right consensus protocol',
        difficulty: 'medium',
        type: 'multiple_choice',
        options: ['Proof of Work', 'Stellar Consensus Protocol (SCP)'],
        answer: 'Stellar Consensus Protocol (SCP)',
      },
    ];

    console.log('\nRunning demonstration migration on 2 legacy records:');
    const migrated = migratePuzzles(legacySamples);
    console.log(JSON.stringify(migrated, null, 2));
    process.exit(0);
  }

  const inputPath = path.resolve(process.cwd(), args[0]);
  const outputPath = args[1] ? path.resolve(process.cwd(), args[1]) : null;

  if (!fs.existsSync(inputPath)) {
    console.error(`Error: input file "${inputPath}" not found.`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const migrated = Array.isArray(raw) ? migratePuzzles(raw) : migratePuzzle(raw);

  if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(migrated, null, 2), 'utf8');
    console.log(`Successfully migrated ${Array.isArray(migrated) ? migrated.length : 1} puzzle(s) to ${outputPath}`);
  } else {
    console.log(JSON.stringify(migrated, null, 2));
  }
}

module.exports = {
  migratePuzzle,
  migratePuzzles,
};
