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

/**
 * Adding a state to a workflow is a NON-breaking change: it affects no
 * existing cards (no card can be in the new state yet). The state insertion is
 * performed by WorkflowResource.update; this handler routes the operation.
 * isBreaking is false, so the engine records no log entry.
 */
export class WorkflowAddStateHandler implements Handler {
  readonly isBreaking = false;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'edit' &&
      ctx.input.target.type === 'workflows' &&
      ctx.input.updateKey.key === 'states' &&
      ctx.input.operation.name === 'add'
    );
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('WorkflowAddStateHandler called with non-edit input');
    }
    const name = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(name, 'workflows');
    if (!resource) {
      throw new Error(`Workflow '${name}' not found`);
    }
    await resource.update(ctx.input.updateKey, ctx.input.operation);
  }

  // No cascade: no existing card can be in the new state.
  async applyCascade(): Promise<void> {}
}
