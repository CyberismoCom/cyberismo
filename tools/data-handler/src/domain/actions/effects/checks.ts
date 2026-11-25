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
