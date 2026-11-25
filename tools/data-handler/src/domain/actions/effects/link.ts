// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Card } from '@cyberismo/model';
import { DHValidationError } from '../../../shared/exceptions/index.js';
import { isExternalItemKey } from '../../../shared/utils/card-utils.js';
import type { Checkout } from '../../../state/checkout/checkout.js';
import { findCard } from '../../cards/read.js';
import {
  addLink as addCardLink,
  getLinkTypeWithValidation,
  removeLink as removeCardLink,
  validateCardTypeForLink,
} from '../../cards/update.js';
import { projectCard, resource } from './checks.js';
import { defineEffect, refuse, type Conflict } from './define.js';

interface LinkArgs {
  source: string;
  destination: string;
  linkType: string;
  description: string | undefined;
}

const args = {
  source: 'card',
  destination: 'card',
  linkType: 'text',
  description: { role: 'text', optional: true },
} as const;

// Checks what adding and removing a link share: both ends are project
// cards and the link type exists. Returns the source and destination cards.
function linkEnds(checkout: Checkout, link: LinkArgs): [Card, Card] {
  for (const key of [link.source, link.destination]) {
    if (isExternalItemKey(key)) {
      refuse(`'${key}' is not a card key (external items are not supported)`);
    }
  }
  const source = projectCard(checkout, link.source);
  const destination = projectCard(checkout, link.destination);
  resource(checkout, link.linkType, 'linkTypes', 'link type');
  return [source, destination];
}

// Whether the source card has the link, matched as removing it matches.
function hasLink(checkout: Checkout, link: LinkArgs): boolean {
  return (findCard(checkout, link.source).metadata?.links ?? []).some(
    (existing) =>
      existing.cardKey === link.destination &&
      existing.linkType === link.linkType &&
      (existing.linkDescription ?? '') === (link.description ?? ''),
  );
}

// A link is either added or removed.
const conflict = (name: string, link: LinkArgs): Conflict => ({
  on: [
    'link',
    link.source,
    link.destination,
    link.linkType,
    link.description ?? '',
  ],
  value: name,
  reason: `the link from card '${link.source}' to card '${link.destination}' is both added and removed`,
});

/**
 * addLink(Source, Destination, LinkType[, Description]): links a card to
 * another card.
 */
export const addLink = defineEffect({
  name: 'addLink',
  args,
  step: 'link',
  check(checkout, e) {
    const ends = linkEnds(checkout, e);
    try {
      const linkType = getLinkTypeWithValidation(
        checkout,
        e.linkType,
        e.description,
      );
      for (const [index, role] of (
        ['source', 'destination'] as const
      ).entries()) {
        validateCardTypeForLink(
          checkout,
          ends[index].metadata?.cardType ?? '',
          linkType,
          role,
          e.linkType,
        );
      }
    } catch (error) {
      if (!(error instanceof DHValidationError)) throw error;
      refuse(error.message);
    }
  },
  conflict: (e) => conflict('addLink', e),
  inPlace: hasLink,
  async apply(checkout, e) {
    await addCardLink(
      checkout,
      e.source,
      e.destination,
      e.linkType,
      e.description,
    );
  },
});

/**
 * removeLink(Source, Destination, LinkType[, Description]): removes the
 * link of a card to another card.
 */
export const removeLink = defineEffect({
  name: 'removeLink',
  args,
  step: 'unlink',
  check(checkout, e) {
    linkEnds(checkout, e);
  },
  conflict: (e) => conflict('removeLink', e),
  inPlace: (checkout, e) => !hasLink(checkout, e),
  async apply(checkout, e) {
    await removeCardLink(
      checkout,
      e.source,
      e.destination,
      e.linkType,
      e.description,
    );
  },
});
