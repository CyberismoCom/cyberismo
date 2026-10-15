/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { readFileSync } from 'node:fs';

import {
  type AttachmentContent,
  type Card,
  type CardAttachment,
  CardLocation,
  type CardListContainer,
  type CardNode,
  type TemplateCardTree,
} from '@cyberismo/model';
import type { Checkout } from '../../state/checkout/checkout.js';
import {
  buildCardHierarchy,
  compareAttachments,
  sortCards,
} from '../../shared/utils/card-utils.js';

// One card, fully hydrated; throws if the checkout does not hold it.
export function findCard(checkout: Checkout, cardToFind: string): Card {
  return checkout.treeOf(cardToFind).card(cardToFind);
}

// Whether the checkout holds the card, in its own cards or in a template's.
export function hasCard(checkout: Checkout, cardKey: string): boolean {
  return checkout.keyRegistry.has(cardKey);
}

// Full cards for the given keys; keys the checkout does not hold are skipped.
export function cardsByKeys(checkout: Checkout, cardIds: string[]): Card[] {
  const cards: Card[] = [];
  for (const cardKey of cardIds) {
    const tree = checkout.keyRegistry.ownerOf(cardKey);
    if (tree) {
      cards.push(tree.card(cardKey));
    }
  }
  return cards;
}

/**
 * Flattens card tree so that children are shown on same level regardless of nesting level.
 * @param array Card tree to flatten
 * @param checkout Project to use
 * @returns Flattened card tree.
 */
export const flattenCardArray = (array: Card[], checkout: Checkout) => {
  const result: Card[] = [];

  array.forEach((item) => {
    const { key, path, parent, children, attachments, metadata } = item;
    const childCardIds = cardsByKeys(checkout, children).map(
      (item) => item.key,
    );

    result.push({
      key,
      path,
      parent,
      children: [...childCardIds],
      attachments,
      metadata,
    });
    if (children) {
      result.push(
        ...flattenCardArray(cardsByKeys(checkout, children), checkout),
      );
    }
  });
  return result;
};

// Metadata-level view of one card; throws if the checkout does not hold it.
export function cardNode(checkout: Checkout, cardKey: string): CardNode {
  return checkout.treeOf(cardKey).node(cardKey);
}

// Content of one card, or undefined if it has none.
export function cardContent(
  checkout: Checkout,
  cardKey: string,
): string | undefined {
  return checkout.treeOf(cardKey).content(cardKey);
}

// Attachment listing of one card.
export function cardAttachments(
  checkout: Checkout,
  cardKey: string,
): CardAttachment[] {
  return checkout.treeOf(cardKey).attachmentsOf(cardKey);
}

// Card keys of the project, the templates or both, each container sorted.
export async function listCards(
  checkout: Checkout,
  cardsFrom: CardLocation = CardLocation.all,
): Promise<CardListContainer[]> {
  const cardListContainer: CardListContainer[] = [];
  if (
    cardsFrom === CardLocation.all ||
    cardsFrom === CardLocation.projectOnly
  ) {
    cardListContainer.push({
      name: checkout.projectName,
      type: 'project',
      cards: checkout.cardTree.keys().sort(sortCards),
    });
  }

  if (
    cardsFrom === CardLocation.all ||
    cardsFrom === CardLocation.templatesOnly
  ) {
    for (const template of checkout.resources.templates()) {
      const templateCards = template.cardTree.keys().sort(sortCards);
      if (templateCards.length) {
        cardListContainer.push({
          name: template.fullName,
          type: 'template',
          cards: templateCards,
        });
      }
    }
  }
  return cardListContainer;
}

// Card keys as a set, unsorted.
export async function listCardIds(
  checkout: Checkout,
  cardsFrom: CardLocation = CardLocation.all,
): Promise<Set<string>> {
  const cardContainers = await listCards(checkout, cardsFrom);
  const allCardIDs = new Set<string>();
  for (const container of cardContainers) {
    const cards = container.cards;
    cards.forEach((card) => allCardIDs.add(card));
  }
  return allCardIDs;
}

// Every template card, module templates included.
export function allTemplateCards(checkout: Checkout): Card[] {
  return checkout.templateTrees().flatMap((tree) => tree.cards());
}

// The project's root cards, children populated.
export async function rootCards(checkout: Checkout): Promise<Card[]> {
  return checkout.cardTree.rootCards();
}

// Template cards per template, as hierarchies.
export async function templateCardTrees(
  checkout: Checkout,
): Promise<TemplateCardTree[]> {
  return checkout.resources.templates().map((template) => {
    const cards = template.cardTree.cards();
    const buildCards = buildCardHierarchy(cards);

    return {
      name: template.data?.name || '',
      cards: buildCards,
    };
  });
}

// Gets all template attachments
async function attachmentsFromTemplates(checkout: Checkout) {
  const templateAttachments: CardAttachment[] = [];
  const templates = checkout.resources.templates();
  for (const template of templates) {
    templateAttachments.push(...template.cardTree.attachments());
  }
  return templateAttachments;
}

// Project and template attachments, sorted by card key and file name.
export async function attachments(
  checkout: Checkout,
): Promise<CardAttachment[]> {
  const attachments = checkout.cardTree.attachments();
  const templateAttachments = await attachmentsFromTemplates(checkout);
  attachments.push(...templateAttachments);
  return attachments.sort(compareAttachments);
}

// File content and mime type of one attachment.
export async function attachment(
  checkout: Checkout,
  cardKey: string,
  filename: string,
): Promise<AttachmentContent> {
  if (!cardKey) {
    throw new Error(`Mandatory parameter 'cardKey' missing`);
  }

  const found = cardAttachments(checkout, cardKey).find(
    (a) => a.fileName === filename,
  );

  if (!found) {
    throw new Error(`Attachment '${filename}' not found for card ${cardKey}`);
  }

  const attachmentPath = `${found.path}/${found.fileName}`;
  const fileBuffer = readFileSync(attachmentPath);
  const mimeType = found.mimeType || 'application/octet-stream';
  const payload: AttachmentContent = { fileBuffer, mimeType };
  return payload;
}

// Collect all labels from cards.
const collectLabels = (cards: Card[]): string[] => {
  return cards.reduce<string[]>((labels, card) => {
    // Add the labels from the current card
    if (card.metadata?.labels) {
      labels.push(...card.metadata.labels);
    }
    return labels;
  }, []);
};

// Unique labels of the project and its templates, sorted alphabetically.
export async function labels(checkout: Checkout): Promise<string[]> {
  const cards = flattenCardArray(checkout.cardTree.rootCards(), checkout);
  const templateCards = allTemplateCards(checkout);

  const labels = collectLabels([...cards, ...templateCards]);
  return Array.from(new Set(labels)).sort();
}
