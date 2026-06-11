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
import { ResourcesFrom } from '../../containers/project/resources-from.js';
import type { Card } from '../../interfaces/project-interfaces.js';
import type {
  Operation,
  RemoveOperation,
} from '../../resources/resource-object.js';
import type { CustomField } from '../../interfaces/resource-interfaces.js';

/**
 * Removing a custom field from a card type is a breaking change (data loss):
 * the field key is dropped from every card of the type. The handler owns the
 * cascade: CardTypeResource.update removes the field from the card type's
 * customFields / alwaysVisibleFields / optionallyVisibleFields and persists it,
 * then the handler drops the field key from each affected card.
 */
export class CardTypeRemoveCustomFieldHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    if (ctx.input.kind !== 'edit') return false;
    if (ctx.input.target.type !== 'cardTypes') return false;
    return (
      ctx.input.updateKey.key === 'customFields' &&
      ctx.input.operation.name === 'remove'
    );
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error(
        'CardTypeRemoveCustomFieldHandler called with non-edit input',
      );
    }
    const cardTypeName = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(cardTypeName, 'cardTypes');
    if (!resource) throw new Error(`CardType '${cardTypeName}' not found`);

    // Remove the field from the card type (and its visible-fields arrays) and
    // persist it (CardTypeResource.update no longer cascades to cards).
    await resource.update(
      ctx.input.updateKey,
      ctx.input.operation as Operation<unknown>,
    );

    await this.applyCascade(ctx);
  }

  // Cascade: drop the field key from every affected card.
  async applyCascade(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error(
        'CardTypeRemoveCustomFieldHandler called with non-edit input',
      );
    }
    const cardTypeName = resourceNameToString(ctx.input.target);
    const item = (ctx.input.operation as RemoveOperation<CustomField>)
      .target as CustomField;
    const cards = this.affectedCards(ctx, cardTypeName);
    for (const card of cards) {
      if (card.metadata) {
        delete card.metadata[item.name];
        await ctx.project.updateCardMetadata(card, card.metadata);
      }
    }
  }

  // Cards using this card type: local project cards plus local template cards
  // (matches CardTypeResource's collectCards scoping).
  private affectedCards(ctx: MutationContext, cardTypeName: string): Card[] {
    const project = [...ctx.project.cards(undefined)];
    const templates = ctx.project.resources
      .templates(ResourcesFrom.localOnly)
      .flatMap((t) => t.templateObject().cards());
    return [...project, ...templates].filter(
      (c) => c.metadata?.cardType === cardTypeName,
    );
  }
}
