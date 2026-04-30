/* globals console, process */

/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import semver from 'semver';

const RELEASE_TYPES = new Set([
  'major',
  'minor',
  'patch',
  'premajor',
  'preminor',
  'prepatch',
  'prerelease',
]);

const [, , arg, preid] = process.argv;

if (!arg) {
  console.error(
    'Usage: node scripts/bump-version.js <new-version | release-type> [preid]\n' +
      '  <new-version>  a valid semver string (e.g. 1.6.0, 1.6.0-rc.0)\n' +
      `  <release-type> one of: ${[...RELEASE_TYPES].join(', ')}\n` +
      '  [preid]        optional prerelease identifier (e.g. rc) for pre* bumps',
  );
  process.exit(1);
}

const packageJsonPath = resolve(import.meta.dirname, '..', 'package.json');
const original = readFileSync(packageJsonPath, 'utf8');
const pkg = JSON.parse(original);

let newVersion;
if (RELEASE_TYPES.has(arg)) {
  newVersion = semver.inc(pkg.version, arg, preid);
  if (!newVersion) {
    console.error(
      `Failed to bump "${pkg.version}" with release type "${arg}".`,
    );
    process.exit(1);
  }
} else if (semver.valid(arg)) {
  newVersion = arg;
} else {
  console.error(
    `Invalid argument "${arg}": expected a semver string (e.g. 1.6.0, 1.6.0-rc.0) ` +
      `or a release type (${[...RELEASE_TYPES].join(', ')}).`,
  );
  process.exit(1);
}

pkg.version = newVersion;

if (pkg.optionalDependencies) {
  for (const name of Object.keys(pkg.optionalDependencies)) {
    pkg.optionalDependencies[name] = newVersion;
  }
}

writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');

console.log(`Bumped @cyberismo/node-clingo to ${newVersion}`);
