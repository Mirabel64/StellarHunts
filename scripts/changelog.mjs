#!/usr/bin/env node
/**
 * Generates a Keep-a-Changelog release section from conventional commits.
 *
 * Usage:
 *   node scripts/changelog.mjs --version 0.2.0 --notes
 *   node scripts/changelog.mjs --version 0.2.0 --write
 *   node scripts/changelog.mjs --version 0.2.0 --check
 *
 * Options:
 *   --version <x.y.z>  Version being released (required).
 *   --from <ref>       Start of the range. Defaults to the latest tag before
 *                      `--to`.
 *   --to <ref>         End of the range. Defaults to HEAD.
 *   --date <YYYY-MM-DD> Release date. Defaults to today (UTC).
 *   --notes            Print the release section to stdout.
 *   --write            Insert/replace the section in CHANGELOG.md.
 *   --check            Exit 1 when CHANGELOG.md does not contain the section
 *                      generated from the current history.
 *
 * Commit format: `type(optional-scope)!: description`, where type is one of
 * feat, fix, perf, refactor, docs, test, build, ci, style, chore. Unknown
 * subjects are collected under "Other Changes" so nothing is silently lost.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, '..');
const CHANGELOG_PATH = join(REPO_ROOT, 'CHANGELOG.md');

const SECTIONS = [
  { types: ['feat'], title: 'Features' },
  { types: ['fix'], title: 'Bug Fixes' },
  { types: ['perf'], title: 'Performance' },
  { types: ['refactor'], title: 'Refactoring' },
  { types: ['docs'], title: 'Documentation' },
  { types: ['test'], title: 'Tests' },
  { types: ['build'], title: 'Build System' },
  { types: ['ci'], title: 'CI/CD' },
  { types: ['style'], title: 'Styles' },
  { types: ['chore'], title: 'Chores' },
];

const CONVENTIONAL_PATTERN = /^([a-zA-Z]+)(?:\(([^)]+)\))?(!)?:\s+(.+)$/;

/** Splits a conventional-commit subject into its parts. */
export function parseCommitSubject(subject) {
  const match = CONVENTIONAL_PATTERN.exec(subject.trim());
  if (!match) return null;

  return {
    type: match[1].toLowerCase(),
    scope: match[2] ?? null,
    breaking: Boolean(match[3]),
    description: match[4].trim(),
  };
}

/** Returns the latest tag reachable from `ref`, or null when there is none. */
export function previousTag(ref = 'HEAD') {
  try {
    return execFileSync(
      'git',
      ['describe', '--tags', '--abbrev=0', `${ref}^`],
      { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
  } catch {
    return null;
  }
}

/** Reads non-merge commits in `from..to` with their short hashes. */
export function readCommits({ from, to = 'HEAD' }) {
  const range = from ? `${from}..${to}` : to;
  const output = execFileSync(
    'git',
    ['log', range, '--no-merges', '--pretty=format:%h%x1f%s%x1e'],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  );

  return output
    .split('\x1e')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [hash, subject] = entry.split('\x1f');
      return { hash, subject };
    });
}

/**
 * Renders the markdown section for a list of commits.
 * Release commits are excluded so the changelog does not list itself.
 */
export function renderReleaseNotes(commits, { version, date }) {
  const grouped = new Map(SECTIONS.map((section) => [section.title, []]));
  grouped.set('Other Changes', []);
  const breaking = [];

  for (const commit of commits) {
    const parsed = parseCommitSubject(commit.subject);
    if (!parsed) {
      grouped.get('Other Changes').push({
        hash: commit.hash,
        text: commit.subject.trim(),
      });
      continue;
    }
    if (
      parsed.type === 'chore' &&
      (parsed.scope === 'release' || /^release v?\d/i.test(parsed.description))
    ) {
      continue;
    }

    const section = SECTIONS.find((entry) =>
      entry.types.includes(parsed.type),
    );
    const line = {
      hash: commit.hash,
      text: parsed.scope
        ? `**${parsed.scope}:** ${parsed.description}`
        : parsed.description,
    };
    (section ? grouped.get(section.title) : grouped.get('Other Changes')).push(
      line,
    );

    if (parsed.breaking) {
      breaking.push(line);
    }
  }

  const lines = [`## [${version}] - ${date}`, ''];

  if (breaking.length > 0) {
    lines.push('### ⚠ Breaking Changes', '');
    for (const item of breaking) {
      lines.push(`- ${item.text} (${item.hash})`);
    }
    lines.push('');
  }

  for (const section of [...SECTIONS, { title: 'Other Changes' }]) {
    const entries = grouped.get(section.title);
    if (!entries || entries.length === 0) continue;

    lines.push(`### ${section.title}`, '');
    for (const entry of entries) {
      lines.push(`- ${entry.text} (${entry.hash})`);
    }
    lines.push('');
  }

  if (lines.length === 2) {
    lines.push('No notable changes.', '');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

/**
 * Inserts or replaces a release section in a changelog document.
 *
 * The `## [Unreleased]` heading (when present) is kept at the top; released
 * sections are ordered newest-first below it.
 */
export function upsertReleaseSection(markdown, version, section) {
  const heading = `## [${version}]`;
  const existingStart = markdown.indexOf(heading);

  if (existingStart !== -1) {
    const nextHeading = markdown.indexOf('\n## [', existingStart + heading.length);
    const end = nextHeading === -1 ? markdown.length : nextHeading + 1;
    const before = markdown.slice(0, existingStart);
    const after = markdown.slice(end);
    return `${before}${section}\n${after}`.replace(/\n{3,}/g, '\n\n');
  }

  const unreleasedStart = markdown.indexOf('## [Unreleased]');
  if (unreleasedStart !== -1) {
    const nextHeading = markdown.indexOf(
      '\n## [',
      unreleasedStart + '## [Unreleased]'.length,
    );
    const insertAt = nextHeading === -1 ? markdown.length : nextHeading + 1;
    const before = markdown.slice(0, insertAt).replace(/\s*$/, '\n\n');
    const after = markdown.slice(insertAt);
    return `${before}${section}\n${after}`.replace(/\n{3,}/g, '\n\n');
  }

  return `${markdown.replace(/\s*$/, '')}\n\n${section}`.replace(
    /\n{3,}/g,
    '\n\n',
  );
}

function parseArgs(argv) {
  const args = {
    version: null,
    from: null,
    to: 'HEAD',
    date: new Date().toISOString().slice(0, 10),
    notes: false,
    write: false,
    check: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case '--version':
        args.version = argv[++index];
        break;
      case '--from':
        args.from = argv[++index];
        break;
      case '--to':
        args.to = argv[++index];
        break;
      case '--date':
        args.date = argv[++index];
        break;
      case '--notes':
        args.notes = true;
        break;
      case '--write':
        args.write = true;
        break;
      case '--check':
        args.check = true;
        break;
      case '--help':
        console.log(
          'Usage: node scripts/changelog.mjs --version <x.y.z> [--notes|--write|--check] [--from <ref>] [--to <ref>] [--date <YYYY-MM-DD>]',
        );
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!args.version) {
    throw new Error('--version is required');
  }
  if (!/^\d+\.\d+\.\d+$/.test(args.version)) {
    throw new Error(`Invalid version: ${args.version}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    throw new Error(`Invalid date: ${args.date}`);
  }

  return args;
}

/** Generates the section for a version from the current repository history. */
export function generateSection({ version, from, to, date }) {
  const resolvedFrom = from ?? previousTag(to);

  // The initial 0.1.0 section is curated in CHANGELOG.md; every later
  // release must be anchored to a previous tag so the notes describe that
  // release only, instead of the entire repository history.
  if (!resolvedFrom && version !== '0.1.0') {
    throw new Error(
      'No previous tag found. Pass --from <ref> to set the start of the release range.',
    );
  }

  const commits = readCommits({ from: resolvedFrom, to });
  return renderReleaseNotes(commits, { version, date });
}

function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const section = generateSection(args);

  if (args.write) {
    const markdown = readFileSync(CHANGELOG_PATH, 'utf8');
    writeFileSync(
      CHANGELOG_PATH,
      upsertReleaseSection(markdown, args.version, section),
      'utf8',
    );
    console.log(`Updated CHANGELOG.md with ${args.version}.`);
    return;
  }

  if (args.check) {
    const markdown = readFileSync(CHANGELOG_PATH, 'utf8');
    const heading = `## [${args.version}]`;
    const start = markdown.indexOf(heading);
    const nextHeading =
      start === -1
        ? -1
        : markdown.indexOf('\n## [', start + heading.length);
    const existing =
      start === -1
        ? ''
        : markdown.slice(start, nextHeading === -1 ? markdown.length : nextHeading).trim();

    if (existing !== section.trim()) {
      console.error(
        `CHANGELOG.md is out of date for ${args.version}. Run: node scripts/changelog.mjs --version ${args.version} --write`,
      );
      process.exit(1);
    }
    console.log(`CHANGELOG.md is up to date for ${args.version}.`);
    return;
  }

  process.stdout.write(section);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
