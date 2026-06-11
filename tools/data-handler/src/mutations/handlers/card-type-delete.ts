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
import type { Operation } from '../../resources/resource-object.js';

export class CardTypeDeleteHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return ctx.input.kind === 'delete' && ctx.input.target.type === 'cardTypes';
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'delete') {
      throw new Error('CardTypeDeleteHandler: non-delete input');
    }
    const cardTypeName = resourceNameToString(ctx.input.target);

    // Interactive deletion of a module-owned card type is not allowed.
    if (ctx.input.target.prefix !== ctx.project.projectPrefix) {
      throw new Error(
        `Cannot delete resource ${cardTypeName}: It is a module resource`,
      );
    }

    // The cascade clears all local usage first so that the resource's own
    // delete (which refuses while usage() is non-empty) can succeed.
    await this.applyCascade(ctx);

    // Delete the card type resource itself. By now usage() is empty.
    const resource = ctx.project.resources.byType(cardTypeName, 'cardTypes');
    if (!resource) throw new Error(`CardType '${cardTypeName}' not found`);
    await resource.delete();
  }

  async applyCascade(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'delete') {
      throw new Error('CardTypeDeleteHandler: non-delete input');
    }
    const cardTypeName = resourceNameToString(ctx.input.target);

    // 1. Strip the card type from every local link type.
    const linkTypes = ctx.project.resources.linkTypes(ResourcesFrom.localOnly);
    for (const lt of linkTypes) {
      const data = lt.data;
      if (!data) continue;
      for (const field of [
        'sourceCardTypes',
        'destinationCardTypes',
      ] as const) {
        if (data[field].includes(cardTypeName)) {
          await lt.update({ key: field }, {
            name: 'remove',
            target: cardTypeName,
          } as Operation<string>);
        }
      }
    }

    // 2. Delete every local card of this type, along with their subtrees and
    //    any links pointing at them. deleteCards handles the cascade; no
    //    per-card permission check applies to a structural cardType deletion.
    const cards = this.affectedCards(ctx, cardTypeName);
    await ctx.project.deleteCards(cards);
  }

  // Cards using this card type: local project cards plus local template cards
  // (matches CardTypeResource's collectCards scoping).
  private affectedCards(ctx: MutationContext, cardTypeName: string): Card[] {
    return [
      ...ctx.project.cards(undefined),
      ...ctx.project.resources
        .templates(ResourcesFrom.localOnly)
        .flatMap((t) => t.templateObject().cards()),
    ].filter((c) => c.metadata?.cardType === cardTypeName);
  }
}
