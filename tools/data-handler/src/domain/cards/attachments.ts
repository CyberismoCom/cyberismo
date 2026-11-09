// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Checkout } from '../../state/checkout/checkout.js';

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
  await createCardAttachment(checkout, cardKey, attachment, buffer);
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
