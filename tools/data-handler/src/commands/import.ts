/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { readCsvFile } from '../utils/csv.js';
import { Validate } from './validate.js';
import { write } from '../infra/rw-lock.js';
import type { CommitIdentity } from '../utils/tx-record.js';
import type { ActorRef } from '@cyberismo/model';

import type { Checkout } from '../infra/checkout.js';
import type { Workspace } from '../workspace/workspace.js';
import {
  addLabel,
  updateCardContent,
  updateCardMetadataKey,
} from '../cards/update.js';
import { createCard } from '../cards/instantiate.js';
import { findCard } from '../cards/read.js';

/**
 * Handles importing cards from a CSV file.
 */
export class Import {
  private readonly checkout: Checkout;
  public readonly actor: ActorRef;
  public readonly identity?: CommitIdentity;

  /** Acts on the handle's project as its actor. */
  constructor(ws: Workspace) {
    this.checkout = ws.checkout;
    this.actor = ws.actor;
    this.identity = ws.identity;
  }

  /**
   * Imports cards based on a csv file
   * @param csvFilePath path to the csv file
   * @param parentCardKey the cards in the csv file will be created under this card
   * @returns card keys of the imported cards
   */
  @write((csvFilePath) => `Import cards from CSV ${csvFilePath}`)
  public async importCsv(
    csvFilePath: string,
    parentCardKey?: string,
  ): Promise<string[]> {
    const csv = await readCsvFile(csvFilePath);

    const isValid = Validate.getInstance().validateJson(csv, 'csvSchema');
    if (isValid.length !== 0) {
      throw new Error(isValid);
    }

    const importedCards = [];

    for (const row of csv) {
      const { title, template, description, labels, ...customFields } = row;
      const templateResource = this.checkout.resources.byType(
        template,
        'templates',
      );
      const templateCards = templateResource.cardTree.cards();
      if (templateCards.length !== 1) {
        console.warn(
          `Template '${template}' for card '${title}' does not have exactly one card. Skipping row.`,
        );
        continue;
      }

      // Create card
      const cards = await createCard(this.checkout, template, parentCardKey);

      if (cards.length !== 1) {
        throw new Error('Card not created');
      }
      const cardKey = cards[0].key;
      const card = findCard(this.checkout, cardKey);
      if (!card.metadata?.cardType) {
        throw new Error(`Card type not found for card ${cardKey}`);
      }
      const cardType = this.checkout.resources
        .byType(card.metadata?.cardType, 'cardTypes')
        .show();

      if (description) {
        await updateCardContent(this.checkout, cardKey, description);
      }

      if (labels) {
        for (const label of labels.split(' ')) {
          try {
            await addLabel(this.checkout, cardKey, label);
          } catch (e) {
            console.error(
              `Failed to create label ${label}: ${e instanceof Error ? e.message : 'Unknown error'}`,
            );
          }
        }
      }

      await updateCardMetadataKey(this.checkout, cardKey, 'title', title);
      for (const [key, value] of Object.entries(customFields)) {
        if (cardType.customFields.find((field) => field.name === key)) {
          await updateCardMetadataKey(this.checkout, cardKey, key, value);
        }
      }
      importedCards.push(cardKey);
    }
    return importedCards;
  }
}
