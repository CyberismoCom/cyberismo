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
 * Renaming a graph model is a breaking change: the model's own handlebar file,
 * calculations and card content references to the old name are rewritten. The
 * whole cascade still lives in GraphModelResource.rename → onNameChange
 * (updateHandleBars + updateCalculations + updateCardContentReferences), so
 * this handler is a thin router: it delegates to resource.rename() and only
 * marks the operation breaking so the engine records a log entry.
 */
export class GraphModelRenameHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'rename' && ctx.input.target.type === 'graphModels'
    );
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('GraphModelRenameHandler called with non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const newName = `${ctx.input.target.prefix}/graphModels/${ctx.input.newIdentifier}`;

    const resource = ctx.project.resources.byType(oldName, 'graphModels');
    if (!resource) {
      throw new Error(`Graph model '${oldName}' not found`);
    }
    await resource.rename(resourceName(newName));
  }
}
