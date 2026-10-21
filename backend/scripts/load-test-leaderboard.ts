#!/usr/bin/env ts-node
/**
 * load-test-leaderboard.ts
 * ------------------------
 * Load-tests the `GET /api/v1/streaks/leaderboard` endpoint under concurrent
 * traffic and reports p50 / p95 / p99 latency statistics.
 *
 * ## Acceptance targets (issue #759)
 * - Throughput : ≥ 100 RPS sustained
 * - p95 latency: < 500 ms
 *
 * ## Usage
 *   npx ts-node scripts/load-test-leaderboard.ts [options]
 *
 *   Options:
 *     --url          Base URL of the API server           (default: http://localhost:3001)
 *     --requests     Total number of requests to send     (default: 500)
 *     --concurrency  Number of parallel workers           (default: 20)
 *     --warmup       Warm-up requests to discard          (default: 10)
 *     --timeout      Per-request timeout in ms            (default: 10000)
 *     --json         Print results as JSON to stdout      (default: false)
 *
 * ## CI / regression tracking
 *   Results are also written to backend/scripts/leaderboard-bench-results.json
 *   so that CI can diff successive runs and alert on p95 regressions.
 *
 *   Use the --json flag for machine-readable output suitable for CI pipelines:
 *     npx ts-node scripts/load-test-leaderboard.ts --json
 */

import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CliArgs {
  url: string;
  path: string;
  requests: number;
  concurrency: number;
  warmup: number;
  timeoutMs: number;
  json: boolean;
}

interface RequestResult {
  /** HTTP status code (0 = network error / timeout) */
  status: number;
  /** End-to-end duration in milliseconds */
  elapsedMs: number;
  /** Error message if the request failed */
  error?: string;
}

interface BenchStats {
  /** ISO-8601 timestamp when the run started */
  ranAt: string;
  /** Full URL that was tested */
  targetUrl: string;
  /** Number of requests attempted */
  total: number;
  /** Number of 2xx responses */
  succeeded: number;
  /** Number of non-2xx or errored responses */
  failed: number;
  /** Parallel worker count */
  concurrency: number;
  /** Median latency (ms) */
  p50: number;
  /** 95th-percentile latency (ms) */
  p95: number;
  /** 99th-percentile latency (ms) */
  p99: number;
  /** Minimum latency (ms) */
  min: number;
  /** Maximum latency (ms) */
  max: number;
  /** Mean latency (ms) */
  mean: number;
  /** Wall-clock duration of the entire run (ms) */
  wallClockMs: number;
  /** Actual requests-per-second achieved */
  rps: number;
  /** Error breakdown by status code / message */
  errorBreakdown: Record<string, number>;
  /** Whether the run passed acceptance targets */
  passed: boolean;
  /** Acceptance target details */
  targets: {
    minRps: number;
    maxP95Ms: number;
    rpsAchieved: number;
    p95Achieved: number;
    rpsOk: boolean;
    p95Ok: boolean;
  };
}

// ---------------------------------------------------------------------------
// Acceptance targets (issue #759)
// ---------------------------------------------------------------------------

const TARGET_MIN_RPS = 100;
const TARGET_MAX_P95_MS = 500;

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): CliArgs {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i++;
  }

  return {
    url: String(args['url'] ?? process.env.BENCH_URL ?? 'http://localhost:3001'),
    path: String(args['path'] ?? process.env.BENCH_PATH ?? '/api/v1/streaks/leaderboard'),
    requests: Number(args['requests'] ?? process.env.BENCH_REQUESTS ?? 500),
    concurrency: Number(args['concurrency'] ?? process.env.BENCH_CONCURRENCY ?? 20),
    warmup: Number(args['warmup'] ?? process.env.BENCH_WARMUP ?? 10),
    timeoutMs: Number(args['timeout'] ?? process.env.BENCH_TIMEOUT_MS ?? 10_000),
    json: args['json'] === true || process.env.BENCH_JSON === '1',
  };
}

// ---------------------------------------------------------------------------
// Percentile helpers
// ---------------------------------------------------------------------------

/**
 * Returns the p-th percentile of a pre-sorted array using linear interpolation.
 */
function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const rank = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sortedValues[lower];
  const weight = rank - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function fmtMs(n: number): string {
  return `${n.toFixed(1)}ms`;
}

// ---------------------------------------------------------------------------
// Single request fire
// ---------------------------------------------------------------------------

/**
 * Fires a single GET request against the leaderboard endpoint and measures
 * end-to-end latency using process.hrtime for nanosecond precision.
 */
async function fireOne(
  client: AxiosInstance,
  reqPath: string,
): Promise<RequestResult> {
  const start = process.hrtime.bigint();
  try {
    const res = await client.get(reqPath, {
      validateStatus: () => true, // don't throw on 4xx/5xx — record them instead
    });
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    return { status: res.status, elapsedMs };
  } catch (err) {
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    return {
      status: 0,
      elapsedMs,
      error: (err as Error).message,
    };
  }
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

/**
 * A worker owns every i-th request (i = workerId, i += concurrency).
 * This distributes the load evenly across all workers without coordination
 * overhead, matching the pattern used in bench-mint.ts.
 */
async function runWorker(
  workerId: number,
  args: CliArgs,
  results: RequestResult[],
): Promise<void> {
  const client = axios.create({
    baseURL: args.url,
    timeout: args.timeoutMs,
    headers: {
      Accept: 'application/json',
    },
  });

  for (let i = workerId; i < args.requests; i += args.concurrency) {
    // eslint-disable-next-line no-await-in-loop
    results[i] = await fireOne(client, args.path);
  }
}

// ---------------------------------------------------------------------------
// Result storage
// ---------------------------------------------------------------------------

const RESULTS_FILE = path.join(__dirname, 'leaderboard-bench-results.json');

/**
 * Appends the current run's stats to the results file.
 * Keeps the last 50 runs to allow regression tracking without unbounded growth.
 */
function persistResults(stats: BenchStats): void {
  let history: BenchStats[] = [];
  if (fs.existsSync(RESULTS_FILE)) {
    try {
      const raw = fs.readFileSync(RESULTS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      history = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      // Corrupt or empty file — start fresh
      history = [];
    }
  }
  history.push(stats);
  // Retain only the most recent 50 runs
  if (history.length > 50) {
    history = history.slice(history.length - 50);
  }
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(history, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.requests <= 0 || args.concurrency <= 0) {
    throw new Error('--requests and --concurrency must be positive integers');
  }
  if (args.concurrency > args.requests) {
    throw new Error('--concurrency must not exceed --requests');
  }

  // ---- Warm-up phase ---------------------------------------------------
  // Discarded results ensure JIT compilation and HTTP connection-pool
  // establishment do not inflate the measured latency of the benchmark phase.
  if (args.warmup > 0) {
    if (!args.json) {
      process.stdout.write(`Warming up with ${args.warmup} requests… `);
    }
    const warmupClient = axios.create({
      baseURL: args.url,
      timeout: args.timeoutMs,
    });
    for (let i = 0; i < args.warmup; i++) {
      // eslint-disable-next-line no-await-in-loop
      await fireOne(warmupClient, args.path);
    }
    if (!args.json) {
      process.stdout.write('done.\n');
    }
  }

  // ---- Benchmark phase -------------------------------------------------
  if (!args.json) {
    console.log(
      `\nSending ${args.requests} requests to ${args.url}${args.path}` +
        ` with concurrency=${args.concurrency}…\n`,
    );
  }

  const results: RequestResult[] = new Array(args.requests);
  const wallStart = Date.now();

  const workers = Array.from({ length: args.concurrency }, (_, idx) =>
    runWorker(idx, args, results),
  );
  await Promise.all(workers);

  const wallClockMs = Date.now() - wallStart;

  // ---- Statistics ------------------------------------------------------
  const samples = results
    .filter((r): r is RequestResult => Boolean(r))
    .map((r) => r.elapsedMs)
    .sort((a, b) => a - b);

  const succeeded = results.filter(
    (r) => r && r.status >= 200 && r.status < 300,
  ).length;
  const failed = results.length - succeeded;

  const errorBreakdown: Record<string, number> = {};
  for (const r of results) {
    if (!r || (r.status >= 200 && r.status < 300)) continue;
    const key = r.status ? `HTTP ${r.status}` : (r.error ?? 'unknown');
    errorBreakdown[key] = (errorBreakdown[key] ?? 0) + 1;
  }

  const rps = wallClockMs > 0 ? Math.round((args.requests / wallClockMs) * 1000) : 0;

  const p50 = percentile(samples, 50);
  const p95 = percentile(samples, 95);
  const p99 = percentile(samples, 99);
  const minLatency = samples.length ? samples[0] : 0;
  const maxLatency = samples.length ? samples[samples.length - 1] : 0;
  const mean = samples.length
    ? samples.reduce((acc, v) => acc + v, 0) / samples.length
    : 0;

  const rpsOk = rps >= TARGET_MIN_RPS;
  const p95Ok = p95 < TARGET_MAX_P95_MS;
  const passed = rpsOk && p95Ok;

  const stats: BenchStats = {
    ranAt: new Date().toISOString(),
    targetUrl: `${args.url}${args.path}`,
    total: results.length,
    succeeded,
    failed,
    concurrency: args.concurrency,
    p50,
    p95,
    p99,
    min: minLatency,
    max: maxLatency,
    mean,
    wallClockMs,
    rps,
    errorBreakdown,
    passed,
    targets: {
      minRps: TARGET_MIN_RPS,
      maxP95Ms: TARGET_MAX_P95_MS,
      rpsAchieved: rps,
      p95Achieved: p95,
      rpsOk,
      p95Ok,
    },
  };

  // ---- Persist results for regression tracking -------------------------
  persistResults(stats);

  // ---- Output ----------------------------------------------------------
  if (args.json) {
    console.log(JSON.stringify(stats, null, 2));
  } else {
    const passEmoji = (ok: boolean) => (ok ? '✅' : '❌');
    const lines = [
      '# Leaderboard endpoint load test (issue #759)',
      '',
      `- URL:           ${stats.targetUrl}`,
      `- Requests:      ${stats.total}  (warmup ${args.warmup} discarded)`,
      `- Concurrency:   ${stats.concurrency}`,
      `- Succeeded:     ${stats.succeeded}  /  Failed: ${stats.failed}`,
      `- Wall clock:    ${(wallClockMs / 1000).toFixed(2)}s`,
      `- Achieved RPS:  ${rps}`,
      '',
      '## Latency',
      '',
      '| metric | value |',
      '|--------|-------|',
      `| p50    | ${fmtMs(p50)} |`,
      `| p95    | ${fmtMs(p95)} |`,
      `| p99    | ${fmtMs(p99)} |`,
      `| min    | ${fmtMs(minLatency)} |`,
      `| max    | ${fmtMs(maxLatency)} |`,
      `| mean   | ${fmtMs(mean)} |`,
      '',
      '## Acceptance targets',
      '',
      '| target | required | achieved | status |',
      '|--------|----------|----------|--------|',
      `| RPS    | ≥ ${TARGET_MIN_RPS}    | ${rps}      | ${passEmoji(rpsOk)} |`,
      `| p95    | < ${TARGET_MAX_P95_MS}ms | ${fmtMs(p95)} | ${passEmoji(p95Ok)} |`,
      '',
      passed
        ? `✅ Run PASSED — all acceptance targets met.`
        : `❌ Run FAILED — one or more targets not met. See above.`,
      '',
    ];

    if (Object.keys(errorBreakdown).length > 0) {
      lines.push('## Errors', '');
      lines.push('| error | count |', '|-------|-------|');
      for (const [key, count] of Object.entries(errorBreakdown)) {
        lines.push(`| ${key} | ${count} |`);
      }
      lines.push('');
    }

    lines.push(`Results appended to: ${RESULTS_FILE}`);
    console.log(lines.join('\n'));
  }

  // Exit with non-zero code when acceptance targets are not met so CI fails.
  if (!passed) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('load-test-leaderboard failed:', err);
  process.exitCode = 1;
});
