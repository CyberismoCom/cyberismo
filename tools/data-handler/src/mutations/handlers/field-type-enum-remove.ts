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
    const newValue = removeOp.replacementValue as EnumDefinition | undefined;
    if (!newValue) return;

    const removedValue = (removeOp.target as EnumDefinition).enumValue;
    const cardsToUpdate = this.affectedCards(ctx, fieldName).filter(
      (card) => card.metadata?.[fieldName] === removedValue,
    );

    await Promise.all(
      cardsToUpdate.map((card) =>
        ctx.project.updateCardMetadataKey(
          card.key,
          fieldName,
          newValue.enumValue,
        ),
      ),
    );
  }

  // Cards of card types that declare this field type: local project cards plus
  // local template cards (matches FieldTypeResource's relevantCardTypes +
  // collectCards scoping).
  private affectedCards(ctx: MutationContext, fieldName: string): Card[] {
    const relevant = new Set(
      ctx.project.resources
        .cardTypes()
        .filter((cardType) =>
          cardType.data?.customFields?.some((f) => f.name === fieldName),
        )
        .map((cardType) => cardType.data!.name),
    );
    if (relevant.size === 0) return [];

    const project = [...ctx.project.cards(undefined)];
    const templates = ctx.project.resources
      .templates(ResourcesFrom.localOnly)
      .flatMap((t) => t.templateObject().cards());
    return [...project, ...templates].filter(
      (c) => c.metadata?.cardType && relevant.has(c.metadata.cardType),
    );
  }
}
