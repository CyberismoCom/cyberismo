// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { deleteDir } from '../../shared/utils/file-utils.js';
import { getChildLogger } from '../../shared/utils/log-utils.js';
import { declaredModules, installedModules } from './inventory.js';

import type { Checkout } from '../../state/checkout/checkout.js';
import type { ModuleInstallation } from '../resources/changes/replay/module-types.js';

/**
 * Options for {@link cleanOrphans}.
 */
export interface CleanOrphansOptions {
  /** Hook invoked before each orphan is deleted. Exceptions propagate. */
  onRemove?: (installation: ModuleInstallation) => void;
}

/**
 * Installations that no declaration reaches, directly or through the
 * remaining installations' dependencies, iterated to a fixed point. An
 * unreferenced cycle is kept.
 */
export function findOrphans<
  T extends { name: string; declaredDependencies: string[] },
>(declared: string[], installed: T[]): T[] {
  const orphans: T[] = [];
  let remaining = installed;
  for (;;) {
    const referenced = new Set(declared);
    for (const installation of remaining) {
      for (const dep of installation.declaredDependencies) {
        referenced.add(dep);
      }
    }
    const toRemove = remaining.filter((i) => !referenced.has(i.name));
    if (toRemove.length === 0) break;
    orphans.push(...toRemove);
    remaining = remaining.filter((i) => referenced.has(i.name));
  }
  return orphans;
}

/**
 * Fixed-point orphan cleanup. Deletes the installations under
 * `.cards/modules/<name>/` that {@link findOrphans} reports.
 *
 * Does not touch `project.configuration.modules` — top-level declarations
 * are the caller's responsibility.
 *
 * @returns Number of installation folders removed.
 */
export async function cleanOrphans(
  checkout: Checkout,
  options: CleanOrphansOptions = {},
): Promise<number> {
  const logger = getChildLogger({ module: 'orphans' });
  const orphans = findOrphans(
    declaredModules(checkout).map((d) => d.name),
    await installedModules(checkout),
  );
  for (const installation of orphans) {
    logger.debug(
      { module: installation.name, path: installation.path },
      'removing orphaned module installation',
    );
    options.onRemove?.(installation);
    await deleteDir(installation.path);
  }
  if (orphans.length > 0) {
    await checkout.refreshAfterModuleChange();
  }
  return orphans.length;
}
