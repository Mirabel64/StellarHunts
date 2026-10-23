#!/usr/bin/env node
/**
 * Verifies that the release version implied by a tag (or workflow input)
 * matches every workspace manifest.
 *
 * Usage:
 *   node scripts/check-release-version.mjs 1.2.3
 *   node scripts/check-release-version.mjs v1.2.3
 *
 * This is the check that stops a mistyped tag from publishing a release
 * whose artifacts were still built from the previous version.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_PATHS = [
  'package.json',
  'backend/package.json',
  'frontend/package.json',
];

function main(argv) {
  const raw = argv[0];
  if (!raw) {
    throw new Error('Usage: node scripts/check-release-version.mjs <version>');
  }

  const version = raw.replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`"${raw}" is not a semver version (expected x.y.z or vx.y.z)`);
  }

  const mismatches = [];
  for (const path of PACKAGE_PATHS) {
    const manifest = JSON.parse(readFileSync(join(REPO_ROOT, path), 'utf8'));
    if (manifest.version !== version) {
      mismatches.push(`${path}: ${manifest.version}`);
    }
  }

  if (mismatches.length > 0) {
    throw new Error(
      `Release version ${version} does not match the workspace manifests:\n  ${mismatches.join(
        '\n  ',
      )}\nRun "npm run release:prepare -- ${version}" and commit the bump before tagging.`,
    );
  }

  console.log(`All workspaces are at ${version}.`);
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
