// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Checkout } from '../../../state/checkout/checkout.js';
import { findCard } from '../../cards/read.js';
import {
  addLabel as addCardLabel,
  removeLabel as removeCardLabel,
} from '../../cards/update.js';
import { projectCard } from './checks.js';
import { defineEffect, type Conflict } from './define.js';

interface LabelArgs {
  card: string;
  label: string;
}

const args = { card: 'card', label: 'text' } as const;

// A label of a card is either added or removed.
const conflict = (name: string, e: LabelArgs): Conflict => ({
  on: ['label', e.card, e.label],
  value: name,
  reason: `the label '${e.label}' of card '${e.card}' is both added and removed`,
});

const hasLabel = (checkout: Checkout, e: LabelArgs) =>
  findCard(checkout, e.card).metadata?.labels?.includes(e.label) ?? false;

/** addLabel(Card, Label): adds a label to a card. */
export const addLabel = defineEffect({
  name: 'addLabel',
  args,
  step: 'fields',
  check(checkout, e) {
    projectCard(checkout, e.card);
  },
  conflict: (e) => conflict('addLabel', e),
  inPlace: hasLabel,
  async apply(checkout, e) {
    await addCardLabel(checkout, e.card, e.label);
  },
});

/** removeLabel(Card, Label): removes a label from a card. */
export const removeLabel = defineEffect({
  name: 'removeLabel',
  args,
  step: 'fields',
  check(checkout, e) {
    projectCard(checkout, e.card);
  },
  conflict: (e) => conflict('removeLabel', e),
  inPlace: (checkout, e) => !hasLabel(checkout, e),
  async apply(checkout, e) {
    await removeCardLabel(checkout, e.card, e.label);
  },
});
