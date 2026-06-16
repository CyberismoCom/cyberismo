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

import type { MutationContext } from '../handler.js';
import { ResourcesFrom } from '../../containers/project/resources-from.js';
import type { Card } from '../../interfaces/project-interfaces.js';
import type { Operation } from '../../resources/resource-object.js';

// Cards using this card type: local project cards plus local template cards
// (matches CardTypeResource's collectCards scoping).
function affectedCards(ctx: MutationContext, cardTypeName: string): Card[] {
  return [
    ...ctx.project.cards(undefined),
    ...ctx.project.resources
      .templates(ResourcesFrom.localOnly)
      .flatMap((t) => t.templateObject().cards()),
  ].filter((c) => c.metadata?.cardType === cardTypeName);
}

/**
 * Consumer-side cascade for deleting a card type, WITHOUT removing the card
 * type resource itself. Strips the card type from every local link type and
 * deletes every local card of this type (with their subtrees and inbound
 * links). Shared by CardTypeDeleteHandler and WorkflowDeleteHandler. Derives
 * everything from the name and tolerates zero matches, so it is safe on replay.
 */
export async function deleteCardTypeCascade(
  ctx: MutationContext,
  cardTypeName: string,
): Promise<void> {
  // 1. Strip the card type from every local link type.
  const linkTypes = ctx.project.resources.linkTypes(ResourcesFrom.localOnly);
  for (const lt of linkTypes) {
    const data = lt.data;
    if (!data) continue;
    for (const field of ['sourceCardTypes', 'destinationCardTypes'] as const) {
      if (data[field].includes(cardTypeName)) {
        await lt.update({ key: field }, {
          name: 'remove',
          target: cardTypeName,
        } as Operation<string>);
      }
    }
  }

  // 2. Delete every local card of this type, along with their subtrees and any
  //    links pointing at them. deleteCards handles the cascade; no per-card
  //    permission check applies to a structural cardType deletion.
  await ctx.project.deleteCards(affectedCards(ctx, cardTypeName));
}

/**
 * Full deletion of a local card type: the consumer cascade plus removal of the
 * card type resource itself. Used when a card type must be removed outright
 * (e.g. its workflow was deleted).
 */
export async function deleteCardType(
  ctx: MutationContext,
  cardTypeName: string,
): Promise<void> {
  await deleteCardTypeCascade(ctx, cardTypeName);
  const resource = ctx.project.resources.byType(cardTypeName, 'cardTypes');
  if (resource) await resource.delete();
}
