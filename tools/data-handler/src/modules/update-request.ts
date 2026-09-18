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

import { ModuleVersionError } from './errors.js';
import { validateExplicitTarget } from './explicit-target.js';
import { requireDeclaredRoot } from './inventory.js';

import type { Credentials } from '../interfaces/project-interfaces.js';
import type { Project } from '../containers/project.js';
import type { SourceLayer } from './source.js';
import type { UpdateRequest } from './resolve/types.js';

/**
 * Builds the resolver request an update stands for, guarding the target on the
 * way. Shared by the apply and preview paths so a dry run can never plan a
 * different move than the update it previews.
 * @param moduleName Module to update. Omitted means every root.
 * @param version Optional exact target version; requires `moduleName`.
 * @throws when the module is not a declared root, or the target version is
 * malformed, outside a declared range, or absent from the source.
 */
export async function buildUpdateRequest(
  project: Project,
  sourceLayer: SourceLayer,
  moduleName?: string,
  version?: string,
  credentials?: Credentials,
): Promise<UpdateRequest> {
  if (!moduleName) {
    if (version) {
      throw new ModuleVersionError('A target version requires a module name');
    }
    return { kind: 'updateAll' };
  }
  const declaration = await requireDeclaredRoot(project, moduleName, 'update');
  if (!version) {
    return { kind: 'update', module: moduleName };
  }
  const to = await validateExplicitTarget(
    project,
    sourceLayer,
    declaration,
    version,
    credentials,
  );
  return { kind: 'update', module: moduleName, to };
}
