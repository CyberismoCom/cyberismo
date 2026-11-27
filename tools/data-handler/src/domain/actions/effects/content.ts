// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Checkout } from '../../../state/checkout/checkout.js';
import { findCard } from '../../cards/read.js';
import { editCardContent } from '../../cards/update.js';
import { projectCard } from './checks.js';
import { defineEffect, refuse, type Conflict } from './define.js';

// A card's content is set once. The value is what the content is set to, as
// the two effects tell their values apart.
const conflict = (cardKey: string, ...value: string[]): Conflict => ({
  on: ['content', cardKey],
  value: JSON.stringify(value),
  once: true,
  reason: `the content of card '${cardKey}' is set more than once`,
});

const contentOf = (checkout: Checkout, cardKey: string) =>
  findCard(checkout, cardKey).content ?? '';

/** setContent(Card, Text): sets the content of a card. */
export const setContent = defineEffect({
  name: 'setContent',
  args: { card: 'card', content: 'text' },
  step: 'fields',
  check(checkout, e) {
    projectCard(checkout, e.card);
  },
  conflict: (e) => conflict(e.card, 'set', e.content),
  inPlace: (checkout, e) => contentOf(checkout, e.card) === e.content,
  async apply(checkout, e) {
    await editCardContent(checkout, e.card, e.content);
  },
});

/**
 * copyContent(Target, Source): sets the content of a card to that of
 * another card, which may be a template or module card.
 */
export const copyContent = defineEffect({
  name: 'copyContent',
  args: { target: 'card', source: 'card' },
  step: 'fields',
  check(checkout, e) {
    projectCard(checkout, e.target);
    if (!checkout.keyRegistry.has(e.source)) {
      refuse(`card '${e.source}' does not exist`);
    }
  },
  conflict: (e) => conflict(e.target, 'copy', e.source),
  inPlace: (checkout, e) =>
    contentOf(checkout, e.target) === contentOf(checkout, e.source),
  async apply(checkout, e) {
    await editCardContent(checkout, e.target, contentOf(checkout, e.source));
  },
});
