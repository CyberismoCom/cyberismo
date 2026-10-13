/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { join } from 'node:path';

import { DefaultContent } from '../../resources/create-defaults.js';
import { isInitialTransition } from '../../utils/resource-utils.js';
import { getChildLogger } from '../../utils/log-utils.js';
import { EMPTY_RANK, sortItems } from '../../utils/lexorank.js';
import { isPredefinedField, ROOT } from '../../utils/constants.js';

import type { Card, CardAttachment, CardMetadata } from '@cyberismo/model';
import type { CardTree, NewCard } from './card-tree.js';
import type { Checkout } from '../project.js';

const logger = getChildLogger({ module: 'template' });

/**
 * Adds new cards to a template.
 * @param checkout Project the template belongs to.
 * @param template The template's card tree.
 * @param cardTypeName card type for the new cards
 * @param count how many cards to add
 * @param parentCard parent card; optional - if missing will create top-level
 *   cards
 * @returns card key IDs of the added cards, in rank order
 */
export async function addTemplateCards(
  checkout: Checkout,
  template: CardTree,
  cardTypeName: string,
  count: number,
  parentCard?: Card,
): Promise<string[]> {
  try {
    const cardType = checkout.resources
      .byType(cardTypeName, 'cardTypes')
      .show();

    const parentKey = parentCard ? parentCard.key : ROOT;
    const cardKeys = checkout.allocateCardKeys(count);
    const ranks = template.rankBlock(parentKey, count);

    await template.createCards(
      cardKeys.map((cardKey, index) => ({
        key: cardKey,
        parent: parentKey,
        content: '',
        attachments: [],
        metadata: { ...DefaultContent.card(cardType), rank: ranks[index] },
      })),
    );
    await checkout.calculationEngine.refreshCardFacts(
      cardKeys.map((cardKey) => template.node(cardKey)),
    );
    return cardKeys;
  } catch (error) {
    logger.error({ error });
    throw error;
  }
}

/**
 * Creates project cards from a template. If a parent card is given, the cards
 * are created underneath it.
 * @param checkout Project the cards are created into.
 * @param template The template's card tree.
 * @param parentCard parent card
 * @returns the created cards
 */
export async function instantiateTemplate(
  checkout: Checkout,
  template: CardTree,
  parentCard?: Card,
): Promise<Card[]> {
  const templateCards = template.cards();
  try {
    if (templateCards.length === 0) {
      throw new Error(
        `No cards in template '${template.name}'. Please add template cards with 'add' command first.`,
      );
    }
    if (parentCard) {
      checkout.findCard(parentCard.key);
    }

    const destination = checkout.cardTree;
    const cardKeyMap = buildCardKeyMap(checkout, templateCards);
    const rootRanks = rootCardRanks(templateCards, destination, parentCard);

    const newCards = templateCards.map((templateCard) =>
      instantiate(checkout, templateCard, cardKeyMap, rootRanks, parentCard),
    );
    await destination.createCards(newCards);

    const created = newCards.map((card) => destination.card(card.key));
    await checkout.calculationEngine.refreshCardFacts(created);
    return created;
  } catch (error) {
    logger.error({ error }, 'Failed to create cards');
    throw error;
  }
}

// Fresh keys for the instantiated copies, keyed by template card key.
function buildCardKeyMap(
  checkout: Checkout,
  cards: Card[],
): Map<string, string> {
  const newCardIds = checkout.allocateCardKeys(cards.length);
  const cardsByKey = new Map<string, string>();
  cards.forEach((card, index) => {
    cardsByKey.set(card.key, newCardIds.at(index) || '');
  });
  return cardsByKey;
}

// Allocates a rank block for the template's root cards, placed after the
// last future sibling at the destination.
function rootCardRanks(
  cards: Card[],
  destination: CardTree,
  parentCard: Card | undefined,
): Map<string, string> {
  const rootCards = sortItems(
    cards.filter((card) => card.parent === ROOT),
    (card) => card.metadata?.rank || '',
  );
  const ranks = destination.rankBlock(
    parentCard ? parentCard.key : ROOT,
    rootCards.length,
  );
  return new Map(rootCards.map((card, index) => [card.key, ranks[index]]));
}

// One instantiated card, built field by field.
function instantiate(
  checkout: Checkout,
  templateCard: Card,
  cardKeyMap: Map<string, string>,
  rootRanks: Map<string, string>,
  parentCard?: Card,
): NewCard {
  if (!templateCard.metadata) {
    throw new Error(`Template card '${templateCard.key}' has no metadata`);
  }
  const templateParentKey = templateCard.parent;
  const isTemplateRootCard = templateParentKey === ROOT;
  const key = cardKeyMap.get(templateCard.key) ?? templateCard.key;

  const attachments: NewCard['attachments'] = [];
  let content = templateCard.content ?? '';
  for (const attachment of templateCard.attachments) {
    const fileName = `${key}-${attachment.fileName}`;
    attachments.push({
      fileName,
      source: join(attachment.path, attachment.fileName),
    });
    content = renamedAttachmentReferences(content, attachment, fileName);
  }

  return {
    // --- computed by the destination ---
    key,
    parent: isTemplateRootCard
      ? (parentCard?.key ?? ROOT)
      : (cardKeyMap.get(templateParentKey) ?? parentCard?.key ?? ROOT),

    // --- carried from the template card ---
    content,

    // --- set by this operation ---
    attachments,

    metadata: instantiatedMetadata(checkout, templateCard.metadata, {
      templateCardKey: templateCard.key,
      rank: rootRanks.get(templateCard.key),
    }),
  };
}

// An attachment copy is named after the card that owns it, so the card's
// references to the file are renamed with it.
function renamedAttachmentReferences(
  content: string,
  attachment: CardAttachment,
  newFileName: string,
): string {
  return content
    .replace(
      new RegExp(
        `(\\{\\{#image\\}\\}[^}]*)"fileName": "${attachment.fileName}"([^}]*\\{\\{\\/image\\}\\})`,
        'g',
      ),
      `$1"fileName": "${newFileName}"$2`,
    )
    .replace(
      new RegExp(`image::${attachment.fileName}`, 'g'),
      `image::${newFileName}`,
    );
}

// The metadata of an instantiated card, field by field. See instantiate().
function instantiatedMetadata(
  checkout: Checkout,
  templateMetadata: CardMetadata,
  computed: { templateCardKey: string; rank: string | undefined },
): CardMetadata {
  const cardType = checkout.resources
    .byType(templateMetadata.cardType, 'cardTypes')
    .show();

  const workflow = checkout.resources
    .byType(cardType.workflow, 'workflows')
    .show();

  const initialWorkflowState = workflow.transitions.find(isInitialTransition);
  if (!initialWorkflowState) {
    throw new Error(
      `Workflow '${cardType.workflow}' initial state cannot be found`,
    );
  }

  const metadata: CardMetadata = {
    // --- computed by the destination ---
    // A root card of the template takes a rank out of the destination's
    // block; a nested one keeps its own, which still orders it correctly
    // among the siblings that came with it.
    rank: computed.rank ?? templateMetadata.rank ?? EMPTY_RANK,
    workflowState: initialWorkflowState.toState,
    createdAt: new Date().toISOString(),
    // links name template card keys, so they are not carried.
    links: [],

    // --- carried from the template card ---
    cardType: cardType.name,
    title: templateMetadata.title,

    // --- set by this operation ---
    templateCardKey: computed.templateCardKey,
  };

  if (templateMetadata.labels) {
    metadata.labels = [...templateMetadata.labels];
  }
  if (templateMetadata.externalLinks) {
    metadata.externalLinks = templateMetadata.externalLinks.map((link) => ({
      ...link,
    }));
  }

  // Authored custom-field values. A null on a template card is its 'no
  // value' marker rather than content, so that slot is left absent.
  for (const [key, value] of Object.entries(templateMetadata)) {
    if (!isPredefinedField(key) && value !== null) {
      metadata[key] = value;
    }
  }

  return metadata;
}
