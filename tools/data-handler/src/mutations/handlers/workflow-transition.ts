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
 * Changing a workflow's transitions (add/remove/change) is a NON-breaking
 * change: transitions are workflow-internal and no card data references them.
 * The transition handling lives in WorkflowResource.update (handleArray and
 * transitionObject), so this handler only routes the operation. isBreaking is
 * false, so the engine records no log entry — matching the legacy
 * ConfigurationLogger classification ('transitions' is a NON_BREAKING_KEY).
 */
export class WorkflowTransitionHandler implements Handler {
  readonly isBreaking = false;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'edit' &&
      ctx.input.target.type === 'workflows' &&
      ctx.input.updateKey.key === 'transitions' &&
      ['add', 'remove', 'change'].includes(ctx.input.operation.name)
    );
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('WorkflowTransitionHandler: non-edit input');
    }
    const name = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(name, 'workflows');
    if (!resource) {
      throw new Error(`Workflow '${name}' not found`);
    }
    await resource.update(ctx.input.updateKey, ctx.input.operation);
  }
}
