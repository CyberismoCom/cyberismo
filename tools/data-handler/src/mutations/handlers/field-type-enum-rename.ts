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
import type { EditInput } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';
import { ResourcesFrom } from '../../containers/project/resources-from.js';
import type { Card } from '../../interfaces/project-interfaces.js';
import type { ChangeOperation } from '../../resources/resource-object.js';
import type { EnumDefinition } from '../../interfaces/resource-interfaces.js';

/**
 * Renaming an enum value (a 'change' on 'enumValues' whose enumValue differs
 * from the new one) is a breaking change: the enum value is the array identity,
 * so every card holding the old value must be remapped. FieldTypeResource.update
 * renames the value in the enum definition; the cross-resource part — rewriting
 * the value on every affected card — lives here. Mirrors
 * WorkflowRenameStateHandler. Marked breaking.
 */
export class FieldTypeEnumRenameHandler implements Handler<EditInput> {
  async apply(ctx: MutationContext<EditInput>): Promise<void> {
    const name = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(name, 'fieldTypes');
    if (!resource) throw new Error(`Field type '${name}' not found`);

    // Rename the value in the enum definition and persist it.
    await resource.update(ctx.input.updateKey, ctx.input.operation);

    await this.applyCascade(ctx);
  }

  // Cascade: rewrite every card holding the old enum value to the new value.
  async applyCascade(ctx: MutationContext<EditInput>): Promise<void> {
    const name = resourceNameToString(ctx.input.target);
    const op = ctx.input.operation as ChangeOperation<EnumDefinition>;
    const oldValue = (op.target as EnumDefinition).enumValue;
    const newValue = (op.to as EnumDefinition).enumValue;

    for (const card of this.affectedCards(ctx, name)) {
      const value = card.metadata?.[name];
      if (value === oldValue) {
        await ctx.project.updateCardMetadataKey(card.key, name, newValue);
      } else if (Array.isArray(value) && (value as string[]).includes(oldValue)) {
        await ctx.project.updateCardMetadataKey(
          card.key,
          name,
          (value as string[]).map((v) => (v === oldValue ? newValue : v)),
        );
      }
    }
  }

  // Every local card that holds this field: local project cards plus local
  // template cards. The field key carrying the old value is itself the evidence
  // a card needs migrating, so no card-type scoping is required.
  private affectedCards(ctx: MutationContext, fieldName: string): Card[] {
    const project = [...ctx.project.cards(undefined)];
    const templates = ctx.project.resources
      .templates(ResourcesFrom.localOnly)
      .flatMap((t) => t.templateObject().cards());
    return [...project, ...templates].filter(
      (c) => c.metadata && fieldName in c.metadata,
    );
  }
}
