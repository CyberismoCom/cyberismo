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
 * Removing a state from a workflow is a breaking change: transitions that
 * reference the state are rewritten (removed, or re-pointed at the replacement
 * state) and every card in the removed state is migrated. That whole cascade
 * still lives in WorkflowResource.update (handleStateRemoval → updateCardStates),
 * so this handler is a thin router: it delegates to `resource.update()` and
 * marks the change breaking so the engine records a log entry.
 */
export class WorkflowRemoveStateHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'edit' &&
      ctx.input.target.type === 'workflows' &&
      ctx.input.updateKey.key === 'states' &&
      ctx.input.operation.name === 'remove'
    );
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('WorkflowRemoveStateHandler: non-edit input');
    }
    const name = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(name, 'workflows');
    if (!resource) {
      throw new Error(`Workflow '${name}' not found`);
    }
    await resource.update(ctx.input.updateKey, ctx.input.operation);
  }
}
