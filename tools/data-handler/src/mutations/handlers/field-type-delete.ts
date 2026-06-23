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
import type { DeleteInput } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';
import { ResourcesFrom } from '../../containers/project/resources-from.js';
import type { Card } from '../../interfaces/project-interfaces.js';
import type { Operation } from '../../resources/resource-object.js';

/**
 * Deleting a field type is a breaking change (data loss). The handler owns the
 * cascade: the field is stripped from every local card type that declares it
 * (CardTypeResource.update also drops it from the visible-field arrays) and the
 * field key is removed from every affected local card. resource.delete() is a
 * pure primitive that no longer refuses on usage.
 */
export class FieldTypeDeleteHandler implements Handler<DeleteInput> {
  async apply(ctx: MutationContext<DeleteInput>): Promise<void> {
    const name = resourceNameToString(ctx.input.target);

    // Interactive deletion of a module-owned field type is not allowed.
    if (ctx.input.target.prefix !== ctx.project.projectPrefix) {
      throw new Error(
        `Cannot delete resource ${name}: It is a module resource`,
      );
    }

    await this.applyCascade(ctx);

    const resource = ctx.project.resources.byType(name, 'fieldTypes');
    if (!resource) throw new Error(`Field type '${name}' not found`);
    await resource.delete();
  }

  // Cascade: strip the field from every local card type declaring it, and drop
  // the field key from every affected local card.
  async applyCascade(ctx: MutationContext<DeleteInput>): Promise<void> {
    const name = resourceNameToString(ctx.input.target);

    const declaringCardTypes = ctx.project.resources
      .cardTypes(ResourcesFrom.localOnly)
      .filter((ct) => ct.data?.customFields?.some((f) => f.name === name));

    for (const cardType of declaringCardTypes) {
      await cardType.update({ key: 'customFields' }, {
        name: 'remove',
        target: { name },
      } as Operation<unknown>);
    }

    const declaringNames = new Set(
      declaringCardTypes.map((ct) => ct.data!.name),
    );
    for (const card of this.affectedCards(ctx, declaringNames)) {
      if (card.metadata && name in card.metadata) {
        delete card.metadata[name];
        await ctx.project.updateCardMetadata(card, card.metadata);
      }
    }
  }

  // Cards whose card type declared the field: local project cards plus local
  // template cards.
  private affectedCards(
    ctx: MutationContext,
    cardTypeNames: Set<string>,
  ): Card[] {
    if (cardTypeNames.size === 0) return [];
    const project = [...ctx.project.cards(undefined)];
    const templates = ctx.project.resources
      .templates(ResourcesFrom.localOnly)
      .flatMap((t) => t.templateObject().cards());
    return [...project, ...templates].filter(
      (c) => c.metadata?.cardType && cardTypeNames.has(c.metadata.cardType),
    );
  }
}
