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
import type { Operation } from '../../resources/resource-object.js';

/**
 * Changing a card type's workflow is a breaking change: cards of the type get
 * their workflowState re-mapped to the new workflow. The cascade is performed
 * by CardTypeResource.update; this handler routes the operation and marks it
 * breaking.
 */
export class CardTypeWorkflowChangeHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    if (ctx.input.kind !== 'edit') return false;
    if (ctx.input.target.type !== 'cardTypes') return false;
    return (
      ctx.input.updateKey.key === 'workflow' &&
      ctx.input.operation.name === 'change'
    );
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error(
        'CardTypeWorkflowChangeHandler called with non-edit input',
      );
    }
    const cardTypeName = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(cardTypeName, 'cardTypes');
    if (!resource) throw new Error(`CardType '${cardTypeName}' not found`);
    await resource.update(
      ctx.input.updateKey,
      ctx.input.operation as Operation<unknown>,
    );
  }
}
