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

import type { Checkout } from '../../infra/checkout.js';
import { errorFunction } from '../../shared/utils/error-utils.js';

/**
 * Creates an attachment for a card.
 * @param cardKey The card to add attachment to
 * @param attachmentName The name for the attachment file
 * @param attachmentData The attachment data
 * @throws If trying to add attachment to module card, or if the card already has it
 */
export async function createCardAttachment(
  checkout: Checkout,
  cardKey: string,
  attachmentName: string,
  attachmentData: Buffer,
): Promise<void> {
  await checkout
    .treeOf(cardKey)
    .addAttachment(cardKey, attachmentName, attachmentData);
}

/**
 * Removes an attachment from a card.
 * @param cardKey The card to remove attachment from
 * @param fileName The name of the attachment file to remove
 * @throws if trying to remove module card attachment, or the attachment was not found.
 */
export async function removeCardAttachment(
  checkout: Checkout,
  cardKey: string,
  fileName: string,
): Promise<void> {
  await checkout.treeOf(cardKey).removeAttachment(cardKey, fileName);
}

/**
 * Renames a card's attachment file, keeping the card cache in step with it.
 * @param cardKey Card whose attachment is renamed.
 * @param fileName Current attachment file name.
 * @param newFileName New attachment file name.
 * @throws if the card or the attachment does not exist.
 */
export async function renameCardAttachment(
  checkout: Checkout,
  cardKey: string,
  fileName: string,
  newFileName: string,
): Promise<void> {
  await checkout
    .treeOf(cardKey)
    .renameAttachment(cardKey, fileName, newFileName);
}

/**
 * Adds an attachment to a card.
 * @param cardKey card ID
 * @param attachment attachment name; its base name names the file
 * @param buffer attachment data
 */
export async function addAttachment(
  checkout: Checkout,
  cardKey: string,
  attachment: string,
  buffer: Buffer,
) {
  try {
    await createCardAttachment(checkout, cardKey, attachment, buffer);
  } catch (error) {
    throw new Error(errorFunction(error), { cause: error });
  }
}

// Removes attachment from template or project card
export async function removeAttachment(
  checkout: Checkout,
  cardKey: string,
  attachment?: string,
) {
  if (!attachment) {
    throw new Error(`Attachment filename required`);
  }

  return removeCardAttachment(checkout, cardKey, attachment);
}
