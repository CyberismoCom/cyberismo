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

import type { Handler, MutationContext } from '../handler.js';
import {
  resourceName,
  resourceNameToString,
} from '../../utils/resource-utils.js';

/**
 * Renaming a workflow is a breaking change: dependent card types' workflow
 * reference and all cross-resource references must be rewritten. The cascade
 * is performed by WorkflowResource.rename; this handler delegates to
 * `resource.rename()` and marks the change breaking so the engine records a
 * log entry.
 */
export class WorkflowRenameHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return ctx.input.kind === 'rename' && ctx.input.target.type === 'workflows';
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('WorkflowRenameHandler called with non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const newName = `${ctx.input.target.prefix}/workflows/${ctx.input.newIdentifier}`;

    const resource = ctx.project.resources.byType(oldName, 'workflows');
    if (!resource) {
      throw new Error(`Workflow '${oldName}' not found`);
    }
    await resource.rename(resourceName(newName));
  }
}
