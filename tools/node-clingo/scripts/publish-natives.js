/* globals console, process */

/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2025

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

// On Windows the `npm` binary is `npm.cmd`; spawn won't auto-resolve.
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';

// The seven known native sub-package names. Must match the umbrella's
// optionalDependencies block once it lands and the TARGETS map in
// build-native-packages.js.
const KNOWN_TARGETS = new Set([
  '@cyberismo/node-clingo-linux-x64-gnu',
  '@cyberismo/node-clingo-linux-x64-musl',
  '@cyberismo/node-clingo-linux-arm64-gnu',
  '@cyberismo/node-clingo-linux-arm64-musl',
  '@cyberismo/node-clingo-darwin-x64',
  '@cyberismo/node-clingo-darwin-arm64',
  '@cyberismo/node-clingo-win32-x64',
]);

const USAGE = `Usage: node scripts/publish-natives.js [options]

Publishes the seven @cyberismo/node-clingo-* native sub-packages to npm
with idempotency: a sub-package whose version is already on npm is
skipped, not re-published.

Options:
  --dir <path>      Directory containing per-platform sub-package directories.
                    The script walks one level deep and considers every
                    subdirectory whose package.json name starts with
                    "@cyberismo/node-clingo-".
                    Default: tools/node-clingo/dist-packages/@cyberismo
  --tag <dist-tag>  npm dist-tag to publish under. Default: latest
  --dry-run         Run "npm publish --dry-run" instead of a real publish.
                    The idempotency check still runs first; sub-packages
                    already on npm at the umbrella's version are skipped.
  -h, --help        Print this help.

The script reads the umbrella version from tools/node-clingo/package.json
and refuses to publish any sub-package whose version differs.

Examples:
  # Local dry-run — validates each tarball without uploading anything.
  node tools/node-clingo/scripts/publish-natives.js --dry-run --tag next

  # Real publish to a non-default dist-tag (e.g. during bootstrap).
  node tools/node-clingo/scripts/publish-natives.js --tag next
`;

const pkgRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(pkgRoot, '..', '..');
const defaultDir = resolve(pkgRoot, 'dist-packages', '@cyberismo');

function parseArgs(argv) {
  const opts = {
    dir: defaultDir,
    tag: 'latest',
    dryRun: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg === '--dir') {
      const next = argv[++i];
      if (!next) {
        console.error('--dir requires a path argument');
        process.exit(2);
      }
      opts.dir = resolve(process.cwd(), next);
    } else if (arg === '--tag') {
      const next = argv[++i];
      if (!next) {
        console.error('--tag requires a dist-tag argument');
        process.exit(2);
      }
      opts.tag = next;
    } else {
      console.error(`Unknown argument: ${arg}`);
      console.error(USAGE);
      process.exit(2);
    }
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));

if (opts.help) {
  console.log(USAGE);
  process.exit(0);
}

// Read umbrella version for lockstep validation.
const umbrellaPkgPath = resolve(pkgRoot, 'package.json');
const umbrellaPkg = JSON.parse(readFileSync(umbrellaPkgPath, 'utf8'));
const expectedVersion = umbrellaPkg.version;

if (!existsSync(opts.dir)) {
  console.error(`Directory not found: ${opts.dir}`);
  process.exit(1);
}
if (!statSync(opts.dir).isDirectory()) {
  console.error(`Not a directory: ${opts.dir}`);
  process.exit(1);
}

console.log(`Publishing native sub-packages from: ${opts.dir}`);
console.log(`Umbrella version (lockstep target): ${expectedVersion}`);
console.log(`dist-tag: ${opts.tag}`);
console.log(`dry-run: ${opts.dryRun ? 'yes' : 'no'}`);
console.log(`repo root: ${repoRoot}`);

// Discover candidate sub-package directories.
const entries = readdirSync(opts.dir, { withFileTypes: true });
const candidates = [];
for (const entry of entries) {
  if (!entry.isDirectory()) continue;
  const dirPath = resolve(opts.dir, entry.name);
  const subPkgPath = resolve(dirPath, 'package.json');
  if (!existsSync(subPkgPath)) continue;
  let subPkg;
  try {
    subPkg = JSON.parse(readFileSync(subPkgPath, 'utf8'));
  } catch (err) {
    console.error(`Skipping ${dirPath}: invalid package.json (${err.message})`);
    continue;
  }
  if (
    typeof subPkg.name !== 'string' ||
    !subPkg.name.startsWith('@cyberismo/node-clingo-')
  ) {
    // Not one of ours; ignore stray dirs.
    continue;
  }
  candidates.push({ dir: dirPath, pkg: subPkg });
}

if (candidates.length === 0) {
  console.error(
    `No @cyberismo/node-clingo-* sub-packages found under ${opts.dir}.`,
  );
  process.exit(1);
}

// Validate names + versions before doing any network work.
const validationErrors = [];
for (const { dir, pkg } of candidates) {
  if (!KNOWN_TARGETS.has(pkg.name)) {
    validationErrors.push(
      `Unknown sub-package name "${pkg.name}" in ${dir}. Expected one of:\n` +
        [...KNOWN_TARGETS].map((n) => `    ${n}`).join('\n'),
    );
    continue;
  }
  if (pkg.version !== expectedVersion) {
    validationErrors.push(
      `Version mismatch in ${dir}: ${pkg.name}@${pkg.version} ` +
        `but umbrella is at ${expectedVersion}. ` +
        `Re-run build-native-packages.js after bump-version.js.`,
    );
  }
}
// Refuse to publish a partial set: with fail-fast: false on the build
// matrix, a single matrix leg failure must not let publish-natives ship
// 6 of 7 packages and have the umbrella reference a missing native.
const presentNames = new Set(candidates.map((c) => c.pkg.name));
const missing = [...KNOWN_TARGETS].filter((n) => !presentNames.has(n));
if (missing.length > 0) {
  validationErrors.push(
    `Incomplete native set under ${opts.dir}: missing\n` +
      missing.map((n) => `    ${n}`).join('\n') +
      `\nExpected all ${KNOWN_TARGETS.size} natives. ` +
      `Check the build matrix for failed legs and re-run.`,
  );
}
if (validationErrors.length > 0) {
  for (const e of validationErrors) console.error(e);
  process.exit(1);
}

// Publish (or dry-run) each sub-package, skipping ones already on npm.
let published = 0;
let skipped = 0;
let wouldPublish = 0;
const failures = [];

for (const { dir, pkg } of candidates) {
  console.log('----');
  console.log(`Considering ${pkg.name}@${pkg.version} from ${dir}`);

  // Idempotency check: ask npm if this exact version is already published.
  const view = spawnSync(
    NPM,
    ['view', `${pkg.name}@${pkg.version}`, 'version'],
    {
      encoding: 'utf8',
    },
  );
  // `npm view` exits non-zero when the package or version isn't found.
  // We treat any output that exactly matches the version as "already published".
  const viewOut = (view.stdout || '').trim();
  if (view.status === 0 && viewOut === pkg.version) {
    console.log(`${pkg.name}@${pkg.version} already published; skipping.`);
    skipped++;
    continue;
  }

  if (opts.dryRun) {
    console.log(
      `Dry run: would publish ${pkg.name}@${pkg.version} with --tag ${opts.tag}`,
    );
    const result = spawnSync(
      'npm',
      ['publish', '--dry-run', '--tag', opts.tag, '--access', 'public'],
      { cwd: dir, stdio: 'inherit' },
    );
    if (result.status !== 0) {
      failures.push(
        `${pkg.name}@${pkg.version} (dry-run exit ${result.status})`,
      );
      continue;
    }
    wouldPublish++;
    continue;
  }

  console.log(`Publishing ${pkg.name}@${pkg.version} with --tag ${opts.tag}`);
  const result = spawnSync(
    NPM,
    ['publish', '--tag', opts.tag, '--provenance', '--access', 'public'],
    { cwd: dir, stdio: 'inherit' },
  );
  if (result.status !== 0) {
    failures.push(`${pkg.name}@${pkg.version} (publish exit ${result.status})`);
    continue;
  }
  published++;
}

console.log('----');
console.log('Summary:');
console.log(`  published:     ${published}`);
console.log(`  skipped:       ${skipped}`);
console.log(`  would-publish: ${wouldPublish}`);
console.log(`  failed:        ${failures.length}`);
if (failures.length > 0) {
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
