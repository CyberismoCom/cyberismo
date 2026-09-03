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

import { validateVersionAgainstConstraints } from './version.js';

import type { Project } from '../containers/project.js';
import type { SourceLayer } from './source.js';

/**
 * Guards an explicit target version with the checks the engine itself does
 * not run: the project's declared ranges for the module, then availability
 * on the remote. Shared by the apply and preview paths so a dry run can
 * never accept a target the real update would refuse.
 * @throws when `version` violates a declared range or is not offered by the
 * source (sources without discrete versions accept any target).
 */
export async function validateExplicitTarget(
  project: Project,
  sourceLayer: SourceLayer,
  moduleName: string,
  location: string,
  version: string,
): Promise<void> {
  const constraints = project.configuration.modules
    .filter((m) => m.name === moduleName && m.version)
    .map((m) => ({ range: m.version!, source: 'project' }));
  validateVersionAgainstConstraints(moduleName, version, constraints);

  const remoteVersions = await sourceLayer.listRemoteVersions(location);
  if (remoteVersions.length > 0 && !remoteVersions.includes(version)) {
    throw new Error(
      `Version '${version}' is not available for module '${moduleName}'. ` +
        `Available versions: ${remoteVersions.join(', ')}`,
    );
  }
}
