// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { ROOT } from '../../../shared/utils/constants.js';
import { createCard } from '../../cards/instantiate.js';
import { asInteger } from '../facts.js';
import { projectCard, resource } from './checks.js';
import { defineEffect } from './define.js';

/**
 * What creates under one parent are ordered by: Ids that are cards come
 * first, in the tree position of the card; then Ids that are canonical
 * integers, in numeric order; then the rest, which their atoms order.
 * @param position The place of a card in the card trees.
 */
export function idOrder(
  id: string,
  position: (cardKey: string) => number | undefined,
): readonly number[] {
  const place = position(id);
  if (place !== undefined) return [0, place];
  const integer = asInteger(id);
  return integer === undefined ? [2] : [1, integer];
}

/**
 * create(Parent, Template[, Id]): creates the cards of a template under a
 * card, or under root. The Id tells creates of one template apart and
 * reaches later programs in the created facts; it is none when left out.
 */
export const create = defineEffect({
  name: 'create',
  args: {
    parent: 'parent',
    template: 'text',
    id: { role: 'term', default: 'none' },
  },
  step: 'create',
  check(checkout, e) {
    if (e.parent.kind === 'card') projectCard(checkout, e.parent.key);
    resource(checkout, e.template, 'templates', 'template');
  },
  sortKey: (e, position) => [
    e.parent.kind === 'card' ? e.parent.key : ROOT,
    ...idOrder(e.id, position),
  ],
  async apply(checkout, e) {
    const cards = await createCard(
      checkout,
      e.template,
      e.parent.kind === 'card' ? e.parent.key : undefined,
    );
    return cards.map((card) => ({
      key: card.key,
      parent: card.parent,
      template: e.template,
      id: e.id,
      templateCard: String(card.metadata?.templateCardKey),
    }));
  },
});
