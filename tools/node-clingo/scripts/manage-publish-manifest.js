/* globals console, process */

/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2025

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// Strip / restore the `install` script around publish.
//
// The `install` script (`pnpm run build:native`) exists to build the native
// binary for in-tree contributors; published consumers must not run it,
// since they receive the binary via the platform-specific optional
// dependency. Stripping at prepack also avoids pnpm v10 / bun flagging it
// as an unapproved lifecycle script.
//
// A backup file (rather than git) keeps this working in CI shallow clones
// and with uncommitted local changes. If a previous publish died between
// strip and restore, the next strip self-heals by restoring first.

import {
  copyFileSync,
  existsSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';

const pkgPath = resolve(import.meta.dirname, '..', 'package.json');
const backupPath = pkgPath + '.prepack-backup';

const [, , action] = process.argv;

if (action === 'strip') {
  if (existsSync(backupPath)) {
    copyFileSync(backupPath, pkgPath);
    unlinkSync(backupPath);
  }
  copyFileSync(pkgPath, backupPath);
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (pkg.scripts) delete pkg.scripts.install;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
} else if (action === 'restore') {
  if (existsSync(backupPath)) {
    copyFileSync(backupPath, pkgPath);
    unlinkSync(backupPath);
  }
} else {
  console.error('Usage: node manage-publish-manifest.js <strip|restore>');
  process.exit(1);
}
