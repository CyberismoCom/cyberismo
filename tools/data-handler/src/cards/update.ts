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

import type {
  Card,
  CardMetadata,
  CustomField,
  ExternalLink,
  MetadataContent,
} from '@cyberismo/model';
import { Validate } from '../commands/validate.js';
import type { Checkout } from '../infra/checkout.js';
import { assertAllowed } from './guard.js';
import { isExternalItemKey } from '../utils/card-utils.js';
import { isPredefinedField } from '../utils/constants.js';
import { getChildLogger } from '../utils/log-utils.js';
import { findCard } from './read.js';

const logger = getChildLogger({ module: 'edit' });

async function saveCardContent(checkout: Checkout, card: Card): Promise<void> {
  return checkout.treeOf(card.key).writeContent(card);
}

async function saveCardMetadata(checkout: Checkout, card: Card): Promise<void> {
  return checkout.treeOf(card.key).writeMetadata(card);
}

// Validates that card's data is valid.
async function validateCard(checkout: Checkout, card: Card): Promise<string> {
  const validator = Validate.getInstance();
  const invalidCustomData = await validator.validateCustomFields(
    checkout,
    card,
    checkout.allModulePrefixes(),
  );
  const invalidWorkFlow = await validator.validateWorkflowState(checkout, card);

  const invalidLabels = validator.validateCardLabels(card);
  if (
    invalidCustomData.length === 0 &&
    invalidWorkFlow.length === 0 &&
    invalidLabels.length === 0
  ) {
    return '';
  }
  const errors: string[] = [];
  if (invalidCustomData.length > 0) {
    errors.push(invalidCustomData);
  }
  if (invalidWorkFlow.length > 0) {
    errors.push(invalidWorkFlow);
  }
  if (invalidLabels.length > 0) {
    errors.push(invalidLabels);
  }
  return errors.join('\n');
}

/**
 * Update a card's content.
 * @param cardKey card key to update.
 * @param content changed content
 */
export async function updateCardContent(
  checkout: Checkout,
  cardKey: string,
  content: string,
) {
  const card = findCard(checkout, cardKey);
  card.content = content;

  // Both files, deliberately: a content edit is expected to bump
  // 'lastUpdated', and only the metadata write stamps it.
  await saveCardContent(checkout, card);
  await saveCardMetadata(checkout, card);
  await checkout.handleCardChanged(card);
}

/**
 * Updates card metadata's single key.
 * @param cardKey card that is updated.
 * @param changedKey changed metadata key
 * @param newValue changed value for the key
 */
export async function updateCardMetadataKey(
  checkout: Checkout,
  cardKey: string,
  changedKey: string,
  newValue: MetadataContent,
) {
  const card = findCard(checkout, cardKey);
  if (!card.metadata) {
    return;
  }

  // Clearing a custom field removes the key entirely: absent and null both
  // mean "no value". Predefined fields keep their stored representation.
  const removeKey = newValue == null && !isPredefinedField(changedKey);
  if (removeKey) {
    if (!(changedKey in card.metadata)) {
      return;
    }
  } else if (card.metadata[changedKey] === newValue) {
    return;
  }

  const cardAsRecord: Record<string, MetadataContent> = card.metadata;
  if (removeKey) {
    delete cardAsRecord[changedKey];
  } else {
    // A predefined field is never removed, so undefined must land as null:
    // an undefined value would be dropped from both the file and the cache.
    cardAsRecord[changedKey] = newValue ?? null;
  }

  const invalidCard =
    checkout.treeOf(cardKey).kind === 'project'
      ? await validateCard(checkout, card)
      : '';
  if (invalidCard.length !== 0) {
    throw new Error(invalidCard);
  }

  // A metadata write cannot relocate a card, so there is nothing structural
  // to follow up here; moving a card is moveCard's job.
  await saveCardMetadata(checkout, card);
}

/**
 * Updates a card's metadata.
 * @param card affected card
 * @param changedMetadata changed content for the card
 */
export async function updateCardMetadata(
  checkout: Checkout,
  card: Card,
  changedMetadata: CardMetadata,
) {
  card.metadata = changedMetadata;
  await saveCardMetadata(checkout, card);
  await checkout.handleCardChanged(card);
}

/**
 * Updates card content (index.adoc) with incoming content.
 * @param cardKey The card to update.
 * @param changedContent New content for the card.
 */
export async function editCardContent(
  checkout: Checkout,
  cardKey: string,
  changedContent: string,
) {
  // A template card has no workflow state, so there is nothing to guard.
  if (checkout.treeOf(cardKey).kind !== 'project') {
    return updateCardContent(checkout, cardKey, changedContent);
  }
  if (findCard(checkout, cardKey)) {
    await assertAllowed(checkout, 'editContent', cardKey);
    await updateCardContent(checkout, cardKey, changedContent);
  }
}

/**
 * Updates card metadata.
 * @param cardKey The card to update
 * @param changedKey Which metadata property was changed
 * @param newValue New value for the metadata property
 */
export async function editCardMetadata(
  checkout: Checkout,
  cardKey: string,
  changedKey: string,
  newValue: MetadataContent,
) {
  if (!changedKey) {
    throw new Error(`Changed key cannot be empty`);
  }

  const card = findCard(checkout, cardKey);
  assertFieldIsEditable(checkout, card, changedKey, newValue);

  // A template card has no workflow state, so there is nothing to guard.
  if (checkout.treeOf(cardKey).kind !== 'project') {
    return updateCardMetadataKey(checkout, cardKey, changedKey, newValue);
  }

  // check for editing rights
  await assertAllowed(checkout, 'editField', cardKey, changedKey);
  await updateCardMetadataKey(checkout, cardKey, changedKey, newValue);
}

/**
 * Rejects edits to calculated custom fields unless the card type enables
 * override for that field. Applies to project and template cards alike, so
 * that the CLI, MCP and the API agree with what the editors allow.
 * @param card Card being edited.
 * @param fieldName Metadata key being changed.
 * @param newValue Value being written.
 */
function assertFieldIsEditable(
  checkout: Checkout,
  card: Card,
  fieldName: string,
  newValue: MetadataContent,
) {
  // Clearing is always allowed: removing a stored value can only move the
  // card towards validity, and it is the only way out when a card type
  // change has turned an existing value into a validation error.
  if (newValue == null) {
    return;
  }
  if (!card.metadata?.cardType) {
    return;
  }
  let customField: CustomField | undefined;
  try {
    const cardType = checkout.resources
      .byType(card.metadata.cardType, 'cardTypes')
      .show();
    customField = cardType.customFields.find((f) => f.name === fieldName);
  } catch (error) {
    // Project validation reports a broken card type separately.
    logger.warn(
      error,
      `Could not resolve card type '${card.metadata.cardType}' of card '${card.key}'; skipping the calculated-field edit guard`,
    );
    return;
  }
  if (customField?.isCalculated && !customField.enableOverride) {
    throw new Error(
      `Cannot edit calculated field '${fieldName}'; the card type does not enable override for it`,
    );
  }
}

/**
 * Creates  a label in the given card
 * @param cardKey The card to which the label is added to
 * @param label The label being added
 */
export async function addLabel(
  checkout: Checkout,
  cardKey: string,
  label: string,
) {
  if (!Validate.isValidLabelName(label)) {
    throw new Error(`Not a valid label name'`);
  }

  const card = findCard(checkout, cardKey);
  const labels = structuredClone(card.metadata?.labels) ?? [];

  if (labels.includes(label)) {
    throw new Error('Label already exists');
  }

  labels.push(label);
  return updateCardMetadataKey(checkout, cardKey, 'labels', labels);
}

// removes label from project
export async function removeLabel(
  checkout: Checkout,
  cardKey: string,
  label: string,
) {
  const card = findCard(checkout, cardKey);
  let labels = card.metadata?.labels ?? [];

  if (!label && labels.length !== 1) {
    throw new Error(
      `No label given and ${labels.length === 0 ? 'there are no labels' : 'there are multiple labels'}`,
    );
  }

  if (labels.length !== 1 && !labels.includes(label)) {
    throw new Error(`Label '${label}' does not exist in card ${cardKey}`);
  }
  // remove all labels if there is only 1, otherwise remove all given labels
  labels =
    labels.length === 1
      ? []
      : labels.filter((labelItem) => labelItem !== label);
  return updateCardMetadataKey(checkout, cardKey, 'labels', labels);
}

/**
 * Creates a link between two cards, or between a card and an external item.
 * Target can be external using format "connector:itemKey" (e.g., "jira:PROJECT-1032").
 * @param cardKey The card key making the request
 * @param targetKey The target card key or external item (connector:itemKey)
 * @param linkType The type of link to add
 * @param linkDescription Optional description of the link
 * @param direction Direction of the link: 'outbound' (card→target) or 'inbound' (target→card), defaults to 'outbound'
 */
export async function addLink(
  checkout: Checkout,
  source: string,
  destination: string,
  linkType: string,
  linkDescription?: string,
  direction?: 'outbound' | 'inbound',
) {
  if (source === destination) {
    throw new Error('Cannot link card to itself');
  }

  const isExternalSource = isExternalItemKey(source);
  const isExternalDestination = isExternalItemKey(destination);

  if (isExternalSource && isExternalDestination) {
    throw new Error(
      'Cannot create link between two external items. One must be a card.',
    );
  }

  if (isExternalSource || isExternalDestination) {
    const cardKey = isExternalDestination ? source : destination;
    const externalItem = isExternalDestination ? destination : source;
    // Use provided direction, or auto-detect from argument order
    const effectiveDirection =
      direction ?? (isExternalDestination ? 'outbound' : 'inbound');
    return createExternalLink(
      checkout,
      cardKey,
      externalItem,
      linkType,
      effectiveDirection,
      linkDescription,
    );
  }

  // For local card-to-card links, source links to destination
  return createLocalLink(
    checkout,
    source,
    destination,
    linkType,
    linkDescription,
  );
}

/**
 * Creates a link between two cards.
 */
async function createLocalLink(
  checkout: Checkout,
  source: string,
  destination: string,
  linkType: string,
  linkDescription?: string,
) {
  const sourceCard = findCard(checkout, source);
  const destinationCard = findCard(checkout, destination);

  const linkTypeObject = getLinkTypeWithValidation(
    checkout,
    linkType,
    linkDescription,
  );

  validateCardTypeForLink(
    checkout,
    sourceCard.metadata!.cardType,
    linkTypeObject,
    'source',
    linkType,
  );
  validateCardTypeForLink(
    checkout,
    destinationCard.metadata!.cardType,
    linkTypeObject,
    'destination',
    linkType,
  );

  const existingLink = sourceCard.metadata?.links.find(
    (l) =>
      l.linkType === linkType &&
      l.cardKey === destination &&
      l.linkDescription === linkDescription,
  );
  if (existingLink) {
    throw new Error(
      `Link from card '${source}' to card '${destination}' already exists`,
    );
  }

  const links = sourceCard.metadata?.links || [];
  links.push({
    linkType,
    cardKey: destination,
    linkDescription,
  });

  await updateCardMetadataKey(checkout, source, 'links', links);
}

/**
 * Gets the link type object and validates link description is allowed.
 */
function getLinkTypeWithValidation(
  checkout: Checkout,
  linkType: string,
  linkDescription?: string,
) {
  const linkTypeObject = checkout.resources
    .byType(linkType, 'linkTypes')
    .show();

  if (!linkTypeObject.enableLinkDescription && linkDescription !== undefined) {
    throw new Error(`Link type '${linkType}' does not allow link description`);
  }

  return linkTypeObject;
}

/**
 * Validates that a card type is allowed as source or destination for a link type.
 */
function validateCardTypeForLink(
  checkout: Checkout,
  cardType: string,
  linkTypeObject: {
    sourceCardTypes: string[];
    destinationCardTypes: string[];
  },
  role: 'source' | 'destination',
  linkType: string,
): void {
  const allowedTypes =
    role === 'source'
      ? linkTypeObject.sourceCardTypes
      : linkTypeObject.destinationCardTypes;

  if (allowedTypes.length > 0 && !allowedTypes.includes(cardType)) {
    throw new Error(
      `Card type '${cardType}' cannot be used as ${role} with link type '${linkType}'`,
    );
  }
}

/**
 * Creates a link between a card and an external item.
 * @param cardKey The card key that will store the link
 * @param externalItem The external item in format "connector:itemKey"
 * @param linkType The type of link to add
 * @param direction 'outbound' = card links to external, 'inbound' = external links to card
 * @param linkDescription Optional description of the link
 */
async function createExternalLink(
  checkout: Checkout,
  cardKey: string,
  externalItem: string,
  linkType: string,
  direction: 'outbound' | 'inbound',
  linkDescription?: string,
) {
  // Parse connector:itemKey
  const [connector, ...rest] = externalItem.split(':');
  const externalItemKey = rest.join(':');

  if (!connector || !externalItemKey) {
    throw new Error(
      `Invalid external item format: '${externalItem}'. Expected 'connector:itemKey'.`,
    );
  }

  const card = findCard(checkout, cardKey);
  const linkTypeObject = getLinkTypeWithValidation(
    checkout,
    linkType,
    linkDescription,
  );

  // Validate card type based on direction
  const role = direction === 'outbound' ? 'source' : 'destination';
  validateCardTypeForLink(
    checkout,
    card.metadata!.cardType,
    linkTypeObject,
    role,
    linkType,
  );

  // Validate connector if restrictions are defined
  if (
    linkTypeObject.destinationConnectors &&
    linkTypeObject.destinationConnectors.length > 0 &&
    !linkTypeObject.destinationConnectors.includes(connector)
  ) {
    throw new Error(
      `Link type '${linkType}' does not support links to connector '${connector}'`,
    );
  }

  // Check for duplicate external link
  const existingLink = card.metadata?.externalLinks?.find(
    (l) =>
      l.linkType === linkType &&
      l.connector === connector &&
      l.externalItemKey === externalItemKey &&
      l.direction === direction &&
      l.linkDescription === linkDescription,
  );
  if (existingLink) {
    throw new Error(
      `External link from card '${cardKey}' to '${connector}:${externalItemKey}' already exists`,
    );
  }

  const externalLinks: ExternalLink[] = card.metadata?.externalLinks || [];
  externalLinks.push({
    linkType,
    connector,
    externalItemKey,
    direction,
    linkDescription,
  });

  await updateCardMetadataKey(
    checkout,
    cardKey,
    'externalLinks',
    externalLinks,
  );
}

// Removes link from project.
// Detects if source or destination is external and routes accordingly.
export async function removeLink(
  checkout: Checkout,
  source: string,
  destination: string,
  linkType?: string,
  linkDescription?: string,
  direction?: 'outbound' | 'inbound',
) {
  const isExternalSource = isExternalItemKey(source);
  const isExternalDestination = isExternalItemKey(destination);

  if (isExternalSource && isExternalDestination) {
    throw new Error(
      'Cannot remove link between two external items. One must be a card.',
    );
  }

  if (isExternalDestination || isExternalSource) {
    const cardKey = isExternalDestination ? source : destination;
    const externalItem = isExternalDestination ? destination : source;
    // Use provided direction, or auto-detect from argument order
    const effectiveDirection =
      direction ?? (isExternalDestination ? 'outbound' : 'inbound');
    return removeExternalLink(
      checkout,
      cardKey,
      externalItem,
      effectiveDirection,
      linkType,
      linkDescription,
    );
  }

  return removeLocalLink(
    checkout,
    source,
    destination,
    linkType,
    linkDescription,
  );
}

// Removes card-to-card link from project.
async function removeLocalLink(
  checkout: Checkout,
  source: string,
  destination: string,
  linkType?: string,
  linkDescription?: string,
) {
  const sourceCard = findCard(checkout, source);
  const link = sourceCard.metadata?.links.find(
    (l) =>
      l.cardKey === destination &&
      l.linkType === (linkType ?? '') &&
      (l.linkDescription ?? '') === (linkDescription ?? ''),
  );
  if (!link) {
    throw new Error(
      linkType
        ? `Link from '${source}' to '${destination}' with link type '${linkType}' not found`
        : `Link from '${source}' to '${destination}' not found`,
    );
  }

  const newLinks = sourceCard.metadata?.links.filter(
    (l) =>
      l.cardKey !== destination ||
      l.linkType !== (linkType ?? '') ||
      (l.linkDescription ?? '') !== (linkDescription ?? ''),
  );

  await updateCardMetadataKey(checkout, source, 'links', newLinks);
}

// Removes external link from project.
async function removeExternalLink(
  checkout: Checkout,
  cardKey: string,
  externalItem: string,
  direction: 'outbound' | 'inbound',
  linkType?: string,
  linkDescription?: string,
) {
  // Parse connector:itemKey
  const [connector, ...rest] = externalItem.split(':');
  const externalItemKey = rest.join(':');

  if (!connector || !externalItemKey) {
    throw new Error(
      `Invalid external item format: '${externalItem}'. Expected 'connector:itemKey'.`,
    );
  }

  const card = findCard(checkout, cardKey);

  const matches = (l: ExternalLink) =>
    l.connector === connector &&
    l.externalItemKey === externalItemKey &&
    l.direction === direction &&
    (!linkType || l.linkType === linkType) &&
    (!linkDescription || l.linkDescription === linkDescription);

  const extLink = card.metadata?.externalLinks?.find(matches);

  if (!extLink) {
    throw new Error(
      `External link from '${cardKey}' to '${connector}:${externalItemKey}' ${linkType ? `with link type '${linkType}' ` : ''}not found`,
    );
  }

  const newExternalLinks: ExternalLink[] =
    card.metadata?.externalLinks?.filter((l) => !matches(l)) ?? [];

  await updateCardMetadataKey(
    checkout,
    cardKey,
    'externalLinks',
    newExternalLinks,
  );
}
