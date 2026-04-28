/* globals console, process */

/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2025

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Semver regex covering the standard core + optional prerelease + optional
// build metadata. Mirrors the official semver.org grammar closely enough for
// our publishing workflow.
const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

const [, , newVersion] = process.argv;

if (!newVersion) {
  console.error(
    'Usage: node scripts/bump-version.js <new-version>\n' +
      '  <new-version> must be a valid semver string (e.g. 1.6.0, 1.6.0-rc.0).',
  );
  process.exit(1);
}

if (!SEMVER_RE.test(newVersion)) {
  console.error(
    `Invalid version "${newVersion}": expected a semver string (e.g. 1.6.0, 1.6.0-rc.0).`,
  );
  process.exit(1);
}

const packageJsonPath = resolve(import.meta.dirname, '..', 'package.json');
const original = readFileSync(packageJsonPath, 'utf8');
const pkg = JSON.parse(original);

pkg.version = newVersion;

if (pkg.optionalDependencies) {
  for (const name of Object.keys(pkg.optionalDependencies)) {
    pkg.optionalDependencies[name] = newVersion;
  }
}

writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');

console.log(`Bumped @cyberismo/node-clingo to ${newVersion}`);
