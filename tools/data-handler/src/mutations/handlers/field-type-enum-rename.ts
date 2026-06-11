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
import type { EnumDefinition } from '../../interfaces/resource-interfaces.js';

/**
 * Renaming an enum value (a 'change' on enumValues where the enumValue itself
 * differs) is a breaking change. FieldTypeResource.update applies the change to
 * the enum definition array only; it does NOT rewrite the value carried by
 * existing cards, so cards keep their old value. This handler routes the
 * operation unchanged and marks it breaking. A change that only edits
 * enumDisplayValue (same enumValue) is not a rename and falls through to the
 * default no-cascade handler, which updates the definition only.
 */
export class FieldTypeEnumRenameHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    if (
      ctx.input.kind !== 'edit' ||
      ctx.input.target.type !== 'fieldTypes' ||
      ctx.input.updateKey.key !== 'enumValues' ||
      ctx.input.operation.name !== 'change'
    ) {
      return false;
    }
    const op = ctx.input.operation as ChangeOperation<EnumDefinition>;
    return (
      (op.target as EnumDefinition).enumValue !==
      (op.to as EnumDefinition).enumValue
    );
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('FieldTypeEnumRenameHandler: non-edit input');
    }
    const fieldName = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(fieldName, 'fieldTypes');
    if (!resource) {
      throw new Error(`Field type '${fieldName}' not found`);
    }
    await resource.update(ctx.input.updateKey, ctx.input.operation);
  }

  // No cascade: cards keep their old enum value (definition-only change).
  async applyCascade(): Promise<void> {}
}
