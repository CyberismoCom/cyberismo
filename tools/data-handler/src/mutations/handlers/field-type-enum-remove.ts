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
 * Removing an enum value is a breaking change. The cascade is performed by
 * FieldTypeResource.update: with a replacementValue, every card holding the
 * removed value is rewritten to the replacement; without one, the value is
 * removed from the enum definition only and cards keep their orphaned value
 * (they are NOT nulled). This handler routes the operation unchanged and marks
 * it breaking.
 */
export class FieldTypeEnumRemoveHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'edit' &&
      ctx.input.target.type === 'fieldTypes' &&
      ctx.input.updateKey.key === 'enumValues' &&
      ctx.input.operation.name === 'remove'
    );
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('FieldTypeEnumRemoveHandler: non-edit input');
    }
    const fieldName = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(fieldName, 'fieldTypes');
    if (!resource) {
      throw new Error(`Field type '${fieldName}' not found`);
    }
    await resource.update(ctx.input.updateKey, ctx.input.operation);
  }
}
