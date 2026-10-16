// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { MutationContext } from '../handler.js';
import { ResourcesFrom } from '../../../../state/resources/resources-from.js';
import type { Card, Operation } from '@cyberismo/model';
import { deleteCards } from '../../../cards/delete.js';

// Cards using this card type: local project cards plus local template cards.
function affectedCards(ctx: MutationContext, cardTypeName: string): Card[] {
  return [
    ...ctx.checkout.cardTree.cards(),
    ...ctx.checkout.resources
      .templates(ResourcesFrom.localOnly)
      .flatMap((t) => t.cardTree.cards()),
  ].filter((c) => c.metadata?.cardType === cardTypeName);
}

/**
 * Consumer-side cascade for deleting a card type, WITHOUT removing the card
 * type resource itself. Strips the card type from every local link type and
 * deletes every local card of this type (with their subtrees and inbound
 * links). Derives everything from the name and tolerates zero matches, so it
 * is safe on replay.
 */
export async function deleteCardTypeCascade(
  ctx: MutationContext,
  cardTypeName: string,
): Promise<void> {
  // 1. Strip the card type from every local link type.
  const linkTypes = ctx.checkout.resources.linkTypes(ResourcesFrom.localOnly);
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
  await deleteCards(ctx.checkout, affectedCards(ctx, cardTypeName));
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
  const resource = ctx.checkout.resources.byType(cardTypeName, 'cardTypes');
  if (resource) await resource.delete();
}
