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

import { mkdir } from 'node:fs/promises';
import { join, resolve as pathResolve } from 'node:path';

import { Validate } from '../commands/validate.js';
import { ProjectPaths } from '../containers/project/project-paths.js';
import { copyDir, deleteDir, pathExists } from '../utils/file-utils.js';

import { isFileLocation, stripFileProtocol } from './location.js';
import type { FetchTarget, SourceLayer } from './source.js';
import type { RemoteQueryOutcome } from './types.js';

/**
 * Source layer for `file:` URLs and bare filesystem paths.
 *
 * File sources do not support versioning: `listRemoteVersions` returns
 * `[]` and `queryRemote` always reports `reachable: true` with no
 * version information. `fetch` stages the referenced project's
 * resources into `destRoot/<nameHint>/.cards/local/` so the applier
 * can treat every staged module uniformly — there is no longer a
 * "live checkout" path that must not be touched. Only the resources
 * subfolder is copied; the rest of the host project (`.temp/`,
 * `.cards/modules/`, working files) is intentionally left out so a
 * file source pointing at a project that itself has imports does not
 * snowball.
 */
export class FileSourceLayer implements SourceLayer {
  async fetch(
    target: FetchTarget,
    destRoot: string,
    nameHint: string,
  ): Promise<string> {
    const sourcePath = isFileLocation(target.location)
      ? pathResolve(stripFileProtocol(target.location))
      : pathResolve(target.location);

    if (isFileLocation(target.location)) {
      // Preserve the validation messages previously emitted by
      // `applier.validateFileSources`.
      const folder = stripFileProtocol(target.location);
      if (!Validate.validateFolder(folder)) {
        throw new Error(
          `Input validation error: folder name is invalid '${folder}'`,
        );
      }
      if (!pathExists(folder)) {
        throw new Error(
          `Input validation error: cannot find project '${folder}'`,
        );
      }
    } else if (!pathExists(sourcePath)) {
      throw new Error(
        `Input validation error: cannot find project '${sourcePath}'`,
      );
    }

    const stagedPath = join(destRoot, nameHint);
    // Idempotent re-stage: callers may invoke fetch repeatedly within a
    // single operation (prefetch + resolve), and a leftover from an
    // earlier run must not bleed into the new staging.
    await deleteDir(stagedPath);

    const sourceResources = new ProjectPaths(sourcePath).resourcesFolder;
    const stagedResources = new ProjectPaths(stagedPath).resourcesFolder;
    await mkdir(stagedResources, { recursive: true });
    await copyDir(sourceResources, stagedResources);
    return stagedPath;
  }

  async listRemoteVersions(): Promise<string[]> {
    return [];
  }

  async queryRemote(): Promise<RemoteQueryOutcome> {
    return {
      reachable: true,
      latest: undefined,
      latestSatisfying: undefined,
    };
  }
}
