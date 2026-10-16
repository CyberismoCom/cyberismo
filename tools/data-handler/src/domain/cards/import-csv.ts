// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { parseCsv } from '../../shared/utils/csv.js';
import { Validate } from '../validation/validate.js';
import type { Checkout } from '../../state/checkout/checkout.js';
import {
  addLabel,
  updateCardContent,
  updateCardMetadataKey,
} from './update.js';
import { createCard } from './instantiate.js';
import { findCard } from './read.js';

// Creates a card per row of a CSV text from the row's template.
export async function importCsv(
  checkout: Checkout,
  csvContent: string,
  parentCardKey?: string,
): Promise<string[]> {
  const csv = parseCsv(csvContent);

  const isValid = Validate.getInstance().validateJson(csv, 'csvSchema');
  if (isValid.length !== 0) {
    throw new Error(isValid);
  }

  const importedCards = [];

  for (const row of csv) {
    const { title, template, description, labels, ...customFields } = row;
    const templateResource = checkout.resources.byType(template, 'templates');
    const templateCards = templateResource.cardTree.cards();
    if (templateCards.length !== 1) {
      console.warn(
        `Template '${template}' for card '${title}' does not have exactly one card. Skipping row.`,
      );
      continue;
    }

    // Create card
    const cards = await createCard(checkout, template, parentCardKey);

    if (cards.length !== 1) {
      throw new Error('Card not created');
    }
    const cardKey = cards[0].key;
    const card = findCard(checkout, cardKey);
    if (!card.metadata?.cardType) {
      throw new Error(`Card type not found for card ${cardKey}`);
    }
    const cardType = checkout.resources
      .byType(card.metadata?.cardType, 'cardTypes')
      .show();

    if (description) {
      await updateCardContent(checkout, cardKey, description);
    }

    if (labels) {
      for (const label of labels.split(' ')) {
        try {
          await addLabel(checkout, cardKey, label);
        } catch (e) {
          console.error(
            `Failed to create label ${label}: ${e instanceof Error ? e.message : 'Unknown error'}`,
          );
        }
      }
    }

    await updateCardMetadataKey(checkout, cardKey, 'title', title);
    for (const [key, value] of Object.entries(customFields)) {
      if (cardType.customFields.find((field) => field.name === key)) {
        await updateCardMetadataKey(checkout, cardKey, key, value);
      }
    }
    importedCards.push(cardKey);
  }
  return importedCards;
}
