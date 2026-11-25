// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { rankAfter, rankFirst as rankCardFirst } from '../../cards/move.js';
import { projectCard } from './checks.js';
import { defineEffect, type Conflict } from './define.js';

// A card is ranked once.
const conflict = (e: { card: string }): Conflict => ({
  on: ['rank', e.card],
  reason: `card '${e.card}' has more than one rank or rankFirst`,
});

/** rank(Card, After): ranks a card right after one of its siblings. */
export const rank = defineEffect({
  name: 'rank',
  args: { card: 'card', after: 'card' },
  step: 'rank',
  check(checkout, e) {
    projectCard(checkout, e.card);
    projectCard(checkout, e.after);
  },
  conflict,
  async apply(checkout, e) {
    await rankAfter(checkout, e.card, e.after);
  },
});

/** rankFirst(Card): ranks a card first among its siblings. */
export const rankFirst = defineEffect({
  name: 'rankFirst',
  args: { card: 'card' },
  step: 'rank',
  check(checkout, e) {
    projectCard(checkout, e.card);
  },
  conflict,
  async apply(checkout, e) {
    await rankCardFirst(checkout, e.card);
  },
});
