// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Card } from '@cyberismo/model';
import type { Checkout } from '../../../state/checkout/checkout.js';
import { refuse } from './define.js';

/** A card of the project, not of a template or a module. */
export function projectCard(checkout: Checkout, cardKey: string): Card {
  const tree = checkout.keyRegistry.ownerOf(cardKey);
  if (!tree) refuse(`card '${cardKey}' does not exist`);
  if (tree.kind !== 'project') {
    refuse(
      `card '${cardKey}' is a ${tree.writable ? 'template' : 'module'} card`,
    );
  }
  return tree.card(cardKey);
}

/** Whether a resource of the type exists; a malformed name does not. */
export function resourceExists(
  checkout: Checkout,
  name: string,
  type: string,
): boolean {
  const parts = name.split('/');
  return (
    parts.length === 3 &&
    parts.every(Boolean) &&
    parts[1] === type &&
    checkout.resources.exists(name)
  );
}

/**
 * Refuses the effect unless the resource exists.
 * @param what What the resource is called in the refusal.
 */
export function resource(
  checkout: Checkout,
  name: string,
  type: string,
  what: string,
) {
  if (!resourceExists(checkout, name, type)) {
    refuse(`${what} '${name}' does not exist`);
  }
}

/** The card type of a card. */
export function cardTypeOf(checkout: Checkout, card: Card) {
  const name = card.metadata?.cardType ?? '';
  if (!resourceExists(checkout, name, 'cardTypes')) {
    refuse(`card '${card.key}' has unknown card type '${name}'`);
  }
  return checkout.resources.byType(name, 'cardTypes').show();
}
