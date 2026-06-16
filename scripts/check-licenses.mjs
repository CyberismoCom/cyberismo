#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * License check for all dependencies
 *
 * Runs `pnpm licenses list --json` and fails if any dependency reports a
 * license that is not on the `allow` list and is not a manually verified
 * `exception`. Policy lives in scripts/license-policy.json.
 * Run with `pnpm check-licenses`; CI runs the same command.
 */

const policyPath = join(
  dirname(fileURLToPath(import.meta.url)),
  'license-policy.json',
);
const { allow, exceptions } = JSON.parse(readFileSync(policyPath, 'utf8'));
const allowed = new Set(allow);

// A package is exempt if its name matches an `exceptions` entry exactly, or an
// entry ending in `*` by prefix (e.g. "lightningcss*" covers all per-platform
// binaries, which each report the same license).
function isExempt(name) {
  return exceptions.some((entry) =>
    entry.endsWith('*') ? name.startsWith(entry.slice(0, -1)) : name === entry,
  );
}

// A license passes if it is on the allow list. For "(A OR B)" expressions it
// passes when either side is allowed. Anything else (including "AND"
// expressions and "Unknown") fails so it surfaces for manual review.
function isAllowed(license) {
  const expr = license.replace(/^\(|\)$/g, '').trim();
  if (/\bOR\b/.test(expr)) {
    return expr.split(/\bOR\b/).some((part) => allowed.has(part.trim()));
  }
  return allowed.has(expr);
}

let raw;
try {
  raw = execFileSync('pnpm', ['licenses', 'list', '--json'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (error) {
  console.error('Failed to run `pnpm licenses list`:');
  console.error(error.stderr || error.message);
  process.exit(1);
}

const data = JSON.parse(raw);
const violations = [];
let checked = 0;

for (const [license, packages] of Object.entries(data)) {
  for (const pkg of packages) {
    checked += 1;
    if (isExempt(pkg.name) || isAllowed(license)) continue;
    violations.push({ name: pkg.name, license, versions: pkg.versions ?? [] });
  }
}

if (violations.length > 0) {
  console.error(
    `\n✖ License check failed: ${violations.length} of ${checked} package(s) have a disallowed license.\n`,
  );
  for (const { name, license, versions } of violations) {
    const at = versions.length ? `@${versions.join(', ')}` : '';
    console.error(`  - ${name}${at} — ${license}`);
  }
  console.error(
    '\nAdd acceptable licenses to `allow`, or verified packages to `exceptions`, in scripts/license-policy.json.\n',
  );
  process.exit(1);
}

console.log(
  `✓ License check passed: ${checked} package(s), all licenses allowed.`,
);
