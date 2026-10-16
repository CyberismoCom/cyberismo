// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { installedModulesWithSources } from './inventory.js';

import type { Checkout } from '../../state/checkout/checkout.js';

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
