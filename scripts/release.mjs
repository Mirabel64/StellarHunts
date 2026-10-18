#!/usr/bin/env node
/**
 * Prepares a release: bumps the workspace versions and writes the changelog
 * section for the new version.
 *
 * Usage:
 *   node scripts/release.mjs patch
 *   node scripts/release.mjs minor --dry-run
 *   node scripts/release.mjs 1.4.0
 *
 * The script deliberately does not commit or tag. It prints the exact
 * commands to run after reviewing the diff, which keeps the irreversible
 * steps (creating a tag, pushing it, publishing) in human hands.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { generateSection, upsertReleaseSection } from './changelog.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_PATHS = [
  'package.json',
  'backend/package.json',
  'frontend/package.json',
];
const CHANGELOG_PATH = join(REPO_ROOT, 'CHANGELOG.md');
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

function git(args) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

function readJson(path) {
  return JSON.parse(readFileSync(join(REPO_ROOT, path), 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(
    join(REPO_ROOT, path),
    `${JSON.stringify(value, null, 2)}\n`,
    'utf8',
  );
}

export function nextVersion(current, bump) {
  if (SEMVER_PATTERN.test(bump)) {
    return bump;
  }

  const [major, minor, patch] = current.split('.').map(Number);
  switch (bump) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(
        `Invalid version bump "${bump}". Use major, minor, patch or an explicit x.y.z version.`,
      );
  }
}

function assertSemver(version) {
  if (!SEMVER_PATTERN.test(version)) {
    throw new Error(`Not a semver version: ${version}`);
  }
}

function assertCleanTree() {
  const status = git(['status', '--porcelain']);
  if (status) {
    throw new Error(
      'Working tree is not clean. Commit or stash your changes before preparing a release.',
    );
  }
}

function tagExists(tag) {
  try {
    git(['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`]);
    return true;
  } catch {
    return false;
  }
}

function main(argv) {
  const dryRun = argv.includes('--dry-run');
  const fromIndex = argv.indexOf('--from');
  const from = fromIndex === -1 ? undefined : argv[fromIndex + 1];
  const bump = argv.find(
    (argument, index) =>
      !argument.startsWith('--') && index !== fromIndex + 1,
  );

  if (!bump) {
    throw new Error(
      'Usage: node scripts/release.mjs <major|minor|patch|x.y.z> [--from <ref>] [--dry-run]',
    );
  }

  assertCleanTree();

  const rootPackage = readJson('package.json');
  const current = rootPackage.version;
  const version = nextVersion(current, bump);
  assertSemver(version);

  for (const path of PACKAGE_PATHS) {
    const manifest = readJson(path);
    if (manifest.version !== current) {
      throw new Error(
        `${path} is at ${manifest.version}, expected ${current}. Align the workspace versions first.`,
      );
    }
  }

  const tag = `v${version}`;
  if (tagExists(tag)) {
    throw new Error(`Tag ${tag} already exists.`);
  }

  const date = new Date().toISOString().slice(0, 10);
  const section = generateSection({ version, from, date });

  if (dryRun) {
    console.log(`Would bump ${current} -> ${version} and write:\n`);
    process.stdout.write(section);
    return;
  }

  for (const path of PACKAGE_PATHS) {
    const manifest = readJson(path);
    manifest.version = version;
    writeJson(path, manifest);
  }

  const changelog = readFileSync(CHANGELOG_PATH, 'utf8');
  writeFileSync(
    CHANGELOG_PATH,
    upsertReleaseSection(changelog, version, section),
    'utf8',
  );

  console.log(`Prepared ${tag}. Next steps:\n`);
  console.log('  git add package.json backend/package.json frontend/package.json \\');
  console.log('          backend/package-lock.json frontend/package-lock.json package-lock.json \\');
  console.log('          CHANGELOG.md');
  console.log(`  git commit -m "chore(release): ${tag}"`);
  console.log(`  git tag -a ${tag} -m "Release ${tag}"`);
  console.log(`  git push origin main --follow-tags`);
  console.log(
    '\nPushing the tag runs .github/workflows/release.yml, which builds the artifacts and publishes the release.',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
