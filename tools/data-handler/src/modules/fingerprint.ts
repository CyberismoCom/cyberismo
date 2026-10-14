/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { installedModulesWithSources } from './inventory.js';

import type { Checkout } from '../containers/project.js';

/**
 * What a module operation's network work is based on: the prefix, the
 * declarations and the installations. An unversioned installation has no
 * version to compare, so its files stand for it.
 */
export async function moduleFingerprint(checkout: Checkout): Promise<string> {
  const installed = await installedModulesWithSources(checkout);
  const contents = await Promise.all(
    installed.map((m) => (m.version === undefined ? treeHash(m.path) : null)),
  );
  return JSON.stringify({
    prefix: checkout.projectPrefix,
    declared: checkout.configuration.modules,
    installed,
    contents,
  });
}

async function treeHash(dir: string): Promise<string> {
  const hash = createHash('sha256');
  const files = (await readdir(dir, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
  for (const file of files) {
    hash.update(`${relative(dir, file)}\0`);
    hash.update(await readFile(file));
    hash.update('\0');
  }
  return hash.digest('hex');
}
