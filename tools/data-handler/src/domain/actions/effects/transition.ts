// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { performTransition } from '../../cards/transition.js';
import { cardTypeOf, projectCard, resourceExists } from './checks.js';
import { defineEffect, refuse } from './define.js';

/** transition(Card, Transition): makes a workflow transition of a card. */
export const transition = defineEffect({
  name: 'transition',
  args: { card: 'card', transition: 'text' },
  step: 'transition',
  check(checkout, e) {
    const { workflow } = cardTypeOf(checkout, projectCard(checkout, e.card));
    const transitions = resourceExists(checkout, workflow, 'workflows')
      ? checkout.resources.byType(workflow, 'workflows').show().transitions
      : [];
    if (!transitions.some((transition) => transition.name === e.transition)) {
      refuse(
        `transition '${e.transition}' is not in workflow '${workflow}' of card '${e.card}'`,
      );
    }
  },
  conflict: (e) => ({
    on: ['transition', e.card],
    reason: `card '${e.card}' has more than one transition`,
  }),
  async apply(checkout, e) {
    await performTransition(checkout, e.card, e.transition);
  },
  trigger: (e) => ({
    kind: 'transition',
    card: e.card,
    transition: e.transition,
  }),
});
