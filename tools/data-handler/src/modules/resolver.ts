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

import { ProjectPaths } from '../containers/project/project-paths.js';
import { readCardsConfig } from '../containers/project/cards-config.js';
import type { ModuleDeclaration, Version } from './types.js';
import type { ProjectSettings } from '../interfaces/project-interfaces.js';

/** A module declaration after the resolver has chosen a concrete version. */
export interface ResolvedModule {
  declaration: ModuleDeclaration;
  /** Git tag/branch to check out; undefined for file sources or unranged git. */
  ref?: string;
  /** Remote URL with credentials injected when needed; ready for `SourceLayer.fetch`. */
  remoteUrl: string;
  /** Resolved semver version; undefined when no concrete version was pinned. */
  version?: Version;
  /** Absolute path where the resolver staged this module's clone. */
  stagedPath: string;
}

/**
 * Read a fetched module's `cardsConfig.json` from its base directory.
 * Exported so callers can read `cardKeyPrefix` before handing a pre-fetched
 * module to the resolver.
 *
 * @throws if the file does not exist or is empty, or if any name fails
 *         filesystem-safety validation.
 */
export async function readModuleConfig(
  basePath: string,
): Promise<ProjectSettings> {
  return readCardsConfig(new ProjectPaths(basePath).configurationFile);
}
