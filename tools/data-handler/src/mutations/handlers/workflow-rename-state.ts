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
import { resourceNameToString } from '../../utils/resource-utils.js';
import type { ChangeOperation } from '../../resources/resource-object.js';

/**
 * Renaming a workflow state (a 'change' on 'states' whose target name differs
 * from the new name) is a breaking change: the state name is the array
 * identity, so every transition referencing it and every card in that state
 * must be rewritten. The cascade is performed by WorkflowResource.update: it
 * rewrites referencing transitions and card states. This handler delegates to
 * `resource.update()` and marks the change breaking.
 *
 * A 'change' that only edits non-identity state properties (e.g. category) is
 * NOT matched here; it falls through to DefaultNoCascadeHandler, which runs the
 * same update without recording a (non-breaking) log entry.
 */
export class WorkflowRenameStateHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    if (ctx.input.kind !== 'edit') return false;
    if (ctx.input.target.type !== 'workflows') return false;
    if (ctx.input.updateKey.key !== 'states') return false;
    if (ctx.input.operation.name !== 'change') return false;

    // Only a state rename (identity change) routes here. The discriminator is
    // that `to.name` differs from `target.name`.
    const op = ctx.input.operation as ChangeOperation<unknown>;
    const targetName = (op.target as { name?: string }).name;
    const toName = (op.to as { name?: string }).name;
    return (
      typeof targetName === 'string' &&
      typeof toName === 'string' &&
      targetName !== toName
    );
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('WorkflowRenameStateHandler: non-edit input');
    }
    const name = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(name, 'workflows');
    if (!resource) {
      throw new Error(`Workflow '${name}' not found`);
    }
    await resource.update(ctx.input.updateKey, ctx.input.operation);
  }
}
