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
 * Adding a custom field to a card type is a breaking change: every card of the
 * type gains the new field (as null). The cascade itself still lives in
 * CardTypeResource.update (handleCustomFieldsChange → handleAddNewField), so
 * this handler only routes the operation and marks it breaking.
 */
export class CardTypeAddCustomFieldHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    if (ctx.input.kind !== 'edit') return false;
    if (ctx.input.target.type !== 'cardTypes') return false;
    return (
      ctx.input.updateKey.key === 'customFields' &&
      ctx.input.operation.name === 'add'
    );
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error(
        'CardTypeAddCustomFieldHandler called with non-edit input',
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
