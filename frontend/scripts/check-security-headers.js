#!/usr/bin/env node
/**
 * frontend/scripts/check-security-headers.js
 *
 * CI helper that verifies all required security headers are configured in
 * next.config.mjs.  Run with:
 *
 *   node frontend/scripts/check-security-headers.js
 *
 * Exits 0 when all checks pass, 1 when one or more checks fail.
 *
 * This script imports `buildCsp` from next.config.mjs directly so it tests
 * the exact CSP string the application will serve, rather than a copy.
 *
 * Usage in CI (package.json):
 *   "check:security-headers": "node scripts/check-security-headers.js"
 */

import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Load next.config.mjs
// ---------------------------------------------------------------------------

const configPath = path.resolve(__dirname, '..', 'next.config.mjs');
let nextConfig;
let buildCsp;

try {
  const mod = await import(pathToFileURL(configPath).href);
  nextConfig = mod.default;
  buildCsp = mod.buildCsp;
} catch (err) {
  console.error(`\n❌  Failed to import next.config.mjs:\n   ${err.message}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Extract the configured headers
// ---------------------------------------------------------------------------

let configuredHeaders = [];
if (typeof nextConfig.headers === 'function') {
  const headerGroups = await nextConfig.headers();
  for (const group of headerGroups) {
    configuredHeaders.push(...group.headers);
  }
} else {
  console.error(
    '\n❌  next.config.mjs does not export a `headers()` function.\n' +
    '   Add an async headers() { return [...] } export to next.config.mjs.\n',
  );
  process.exit(1);
}

/** @param {string} key */
function getHeaderValue(key) {
  const entry = configuredHeaders.find(
    (h) => h.key.toLowerCase() === key.toLowerCase(),
  );
  return entry ? entry.value : null;
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function check(description, fn) {
  try {
    fn();
    console.log(`  ✅  ${description}`);
    passed++;
  } catch (err) {
    console.error(`  ❌  ${description}\n      ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log('\n🔒  StellarHunts — Security Header Check\n');

// 1. Content-Security-Policy presence and key directives
check('Content-Security-Policy header is present', () => {
  const csp = getHeaderValue('Content-Security-Policy');
  assert(csp !== null, 'Content-Security-Policy header is missing');
});

check("CSP contains default-src 'self'", () => {
  const csp = getHeaderValue('Content-Security-Policy');
  assert(csp !== null, 'Content-Security-Policy header is missing');
  assert(
    csp.includes("default-src 'self'"),
    `CSP default-src directive should be "'self'", got: ${csp}`,
  );
});

check('CSP does not use wildcard (*) in script-src', () => {
  const csp = getHeaderValue('Content-Security-Policy');
  assert(csp !== null, 'Content-Security-Policy header is missing');
  const scriptSrcMatch = csp.match(/script-src([^;]*)/);
  if (scriptSrcMatch) {
    assert(
      !scriptSrcMatch[1].includes('*'),
      `script-src should not contain wildcard (*): ${scriptSrcMatch[0]}`,
    );
  }
});

check("CSP contains frame-ancestors 'none'", () => {
  const csp = getHeaderValue('Content-Security-Policy');
  assert(csp !== null, 'Content-Security-Policy header is missing');
  assert(
    csp.includes("frame-ancestors 'none'"),
    "CSP should include frame-ancestors 'none' to prevent clickjacking",
  );
});

check('CSP contains object-src', () => {
  const csp = getHeaderValue('Content-Security-Policy');
  assert(csp !== null, 'Content-Security-Policy header is missing');
  assert(
    csp.includes('object-src'),
    'CSP should include an object-src directive',
  );
});

check('CSP allows Stellar/Soroban origins in connect-src', () => {
  const csp = getHeaderValue('Content-Security-Policy');
  assert(csp !== null, 'Content-Security-Policy header is missing');
  assert(
    csp.includes('soroban-testnet.stellar.org') ||
    csp.includes('soroban.stellar.org') ||
    csp.includes('stellar.org'),
    'CSP connect-src should allow Stellar/Soroban RPC origins',
  );
});

check('CSP contains base-uri directive', () => {
  const csp = getHeaderValue('Content-Security-Policy');
  assert(csp !== null, 'Content-Security-Policy header is missing');
  assert(csp.includes('base-uri'), 'CSP should include a base-uri directive');
});

// 2. X-Frame-Options
check('X-Frame-Options header is present', () => {
  const value = getHeaderValue('X-Frame-Options');
  assert(value !== null, 'X-Frame-Options header is missing');
});

check('X-Frame-Options is set to DENY', () => {
  const value = getHeaderValue('X-Frame-Options');
  assert(value !== null, 'X-Frame-Options header is missing');
  assert(
    value.toUpperCase() === 'DENY',
    `X-Frame-Options should be DENY, got: ${value}`,
  );
});

// 3. X-Content-Type-Options
check('X-Content-Type-Options header is present', () => {
  const value = getHeaderValue('X-Content-Type-Options');
  assert(value !== null, 'X-Content-Type-Options header is missing');
});

check('X-Content-Type-Options is set to nosniff', () => {
  const value = getHeaderValue('X-Content-Type-Options');
  assert(value !== null, 'X-Content-Type-Options header is missing');
  assert(
    value.toLowerCase() === 'nosniff',
    `X-Content-Type-Options should be nosniff, got: ${value}`,
  );
});

// 4. Referrer-Policy
check('Referrer-Policy header is present', () => {
  const value = getHeaderValue('Referrer-Policy');
  assert(value !== null, 'Referrer-Policy header is missing');
});

check('Referrer-Policy is strict-origin-when-cross-origin', () => {
  const value = getHeaderValue('Referrer-Policy');
  assert(value !== null, 'Referrer-Policy header is missing');
  assert(
    value === 'strict-origin-when-cross-origin',
    `Referrer-Policy should be strict-origin-when-cross-origin, got: ${value}`,
  );
});

// 5. Permissions-Policy
check('Permissions-Policy header is present', () => {
  const value = getHeaderValue('Permissions-Policy');
  assert(value !== null, 'Permissions-Policy header is missing');
});

check('Permissions-Policy disables camera access', () => {
  const value = getHeaderValue('Permissions-Policy');
  assert(value !== null, 'Permissions-Policy header is missing');
  assert(value.includes('camera=()'), 'Permissions-Policy should disable camera');
});

check('Permissions-Policy disables geolocation access', () => {
  const value = getHeaderValue('Permissions-Policy');
  assert(value !== null, 'Permissions-Policy header is missing');
  assert(
    value.includes('geolocation=()'),
    'Permissions-Policy should disable geolocation',
  );
});

// 6. Strict-Transport-Security
check('Strict-Transport-Security header is present', () => {
  const value = getHeaderValue('Strict-Transport-Security');
  assert(value !== null, 'Strict-Transport-Security header is missing');
});

check('HSTS max-age is at least one year (31536000 seconds)', () => {
  const value = getHeaderValue('Strict-Transport-Security');
  assert(value !== null, 'Strict-Transport-Security header is missing');
  const match = value.match(/max-age=(\d+)/);
  assert(match, `HSTS header does not contain a max-age directive: ${value}`);
  const maxAge = parseInt(match[1], 10);
  assert(
    maxAge >= 31536000,
    `HSTS max-age should be >= 31536000 (1 year), got: ${maxAge}`,
  );
});

check('HSTS includes includeSubDomains', () => {
  const value = getHeaderValue('Strict-Transport-Security');
  assert(value !== null, 'Strict-Transport-Security header is missing');
  assert(
    value.includes('includeSubDomains'),
    `HSTS should include includeSubDomains: ${value}`,
  );
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n─────────────────────────────────────────`);
console.log(`  Passed: ${passed}  |  Failed: ${failed}`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  console.error(
    `${failed} security header check(s) failed.\n` +
    `Review the errors above and update frontend/next.config.mjs.\n`,
  );
  process.exit(1);
}

console.log('All security header checks passed.\n');
