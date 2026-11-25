// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { ROOT } from '../../../shared/utils/constants.js';
import { moveCard } from '../../cards/move.js';
import { findCard } from '../../cards/read.js';
import { projectCard } from './checks.js';
import { defineEffect, type CardRef } from './define.js';

const keyOf = (parent: CardRef) => (parent.kind === 'card' ? parent.key : ROOT);

/** move(Card, Parent): moves a card under another card, or under root. */
export const move = defineEffect({
  name: 'move',
  args: { card: 'card', parent: 'parent' },
  step: 'move',
  check(checkout, e) {
    projectCard(checkout, e.card);
    if (e.parent.kind === 'card') projectCard(checkout, e.parent.key);
  },
  conflict: (e) => ({
    on: ['move', e.card],
    reason: `card '${e.card}' has more than one move`,
  }),
  inPlace: (checkout, e) =>
    findCard(checkout, e.card).parent === keyOf(e.parent),
  async apply(checkout, e) {
    await moveCard(checkout, e.card, keyOf(e.parent));
  },
});
