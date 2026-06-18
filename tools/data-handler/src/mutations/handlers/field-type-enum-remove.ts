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
import type { RemoveOperation } from '../../resources/resource-object.js';
import type { EnumDefinition } from '../../interfaces/resource-interfaces.js';

// An enum value from either recorded shape: a full EnumDefinition object or
// a bare string.
function enumValueOf(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  return typeof value === 'object'
    ? (value as { enumValue?: string }).enumValue
    : String(value);
}

/**
 * Removing an enum value is a breaking change. FieldTypeResource.update removes
 * the value from the enum definition and persists it (it no longer cascades).
 * The handler then owns the consumer-side cascade: with a replacementValue,
 * every card holding the removed value is rewritten to the replacement; without
 * one, the value is removed from the enum definition only and cards keep their
 * orphaned value (they are NOT nulled). Marked breaking.
 */
export class FieldTypeEnumRemoveHandler implements Handler<EditInput> {
  async apply(ctx: MutationContext<EditInput>): Promise<void> {
    const fieldName = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(fieldName, 'fieldTypes');
    if (!resource) {
      throw new Error(`Field type '${fieldName}' not found`);
    }

    // Remove the value from the enum definition and persist (validation runs in
    // FieldTypeResource.update).
    await resource.update(ctx.input.updateKey, ctx.input.operation);

    await this.applyCascade(ctx);
  }

  // Cascade: when a replacement value is given, rewrite every card that held
  // the removed value to the replacement. Without one, cards keep their
  // orphaned value.
  async applyCascade(ctx: MutationContext<EditInput>): Promise<void> {
    const fieldName = resourceNameToString(ctx.input.target);
    const removeOp = ctx.input.operation as RemoveOperation<EnumDefinition>;
    // Recorded entries (and authoring surfaces) may carry either a full
    // EnumDefinition object or a bare string for target/replacementValue;
    // tolerate both shapes.
    const replacement = enumValueOf(removeOp.replacementValue);
    if (!replacement) return;

    const removedValue = enumValueOf(removeOp.target);
    const cardsToUpdate = this.affectedCards(ctx, fieldName).filter(
      (card) => card.metadata?.[fieldName] === removedValue,
    );

    await Promise.all(
      cardsToUpdate.map((card) => {
        card.metadata![fieldName] = replacement;
        // Non-validating write: replay applies entries mechanically and the
        // resulting project is judged once, at the end, by the replay's
        // validation gate. Per-write validation here would reject a card that
        // a later entry in the chain has yet to migrate.
        return ctx.project.updateCardMetadata(card, card.metadata!);
      }),
    );
  }

  // Local project cards plus local template cards that hold a value under this
  // field. Selection is by the metadata KEY, not by the (possibly-renamed)
  // card type name: a card type rename elsewhere in the same update must not
  // hide a card from this cascade.
  private affectedCards(ctx: MutationContext, fieldName: string): Card[] {
    const project = [...ctx.project.cards(undefined)];
    const templates = ctx.project.resources
      .templates(ResourcesFrom.localOnly)
      .flatMap((t) => t.templateObject().cards());
    return [...project, ...templates].filter(
      (c) => c.metadata != null && fieldName in c.metadata,
    );
  }
}
