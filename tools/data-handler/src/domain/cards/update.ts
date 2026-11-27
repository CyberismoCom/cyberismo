// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type {
  LinkDirection,
  Card,
  CardMetadata,
  CustomField,
  ExternalLink,
  MetadataContent,
} from '@cyberismo/model';
import { Validate } from '../validation/validate.js';
import type { Checkout } from '../../state/checkout/checkout.js';
import { assertAllowed } from './guard.js';
import { isExternalItemKey } from '../../shared/utils/card-utils.js';
import {
  isEmptyFieldValue,
  isPredefinedField,
} from '../../shared/utils/constants.js';
import { getChildLogger } from '../../shared/utils/log-utils.js';
import { findCard } from './read.js';
import { DHValidationError } from '../../shared/exceptions/index.js';

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

  // Clearing a custom field removes the key entirely: absent, null and an empty
  // string all mean "no value". Predefined fields keep their stored
  // representation.
  const removeKey =
    isEmptyFieldValue(newValue) && !isPredefinedField(changedKey);
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
    throw new DHValidationError(invalidCard);
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
    throw new DHValidationError(`Changed key cannot be empty`);
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
  if (isEmptyFieldValue(newValue)) {
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
    throw new DHValidationError(
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
    throw new DHValidationError(`Not a valid label name'`);
  }

  const card = findCard(checkout, cardKey);
  const labels = structuredClone(card.metadata?.labels) ?? [];

  if (labels.includes(label)) {
    throw new DHValidationError('Label already exists');
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
    throw new DHValidationError(
      `No label given and ${labels.length === 0 ? 'there are no labels' : 'there are multiple labels'}`,
    );
  }

  if (labels.length !== 1 && !labels.includes(label)) {
    throw new DHValidationError(
      `Label '${label}' does not exist in card ${cardKey}`,
    );
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
    throw new DHValidationError('Cannot link card to itself');
  }

  const isExternalSource = isExternalItemKey(source);
  const isExternalDestination = isExternalItemKey(destination);

  if (isExternalSource && isExternalDestination) {
    throw new DHValidationError(
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
      descriptionOf(l.linkDescription) === descriptionOf(linkDescription),
  );
  if (existingLink) {
    throw new DHValidationError(
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
export function getLinkTypeWithValidation(
  checkout: Checkout,
  linkType: string,
  linkDescription?: string,
) {
  const linkTypeObject = checkout.resources
    .byType(linkType, 'linkTypes')
    .show();

  if (!linkTypeObject.enableLinkDescription && linkDescription !== undefined) {
    throw new DHValidationError(
      `Link type '${linkType}' does not allow link description`,
    );
  }

  return linkTypeObject;
}

/**
 * Validates that a card type is allowed as source or destination for a link type.
 */
export function validateCardTypeForLink(
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
    throw new DHValidationError(
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
    throw new DHValidationError(
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
    throw new DHValidationError(
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
      descriptionOf(l.linkDescription) === descriptionOf(linkDescription),
  );
  if (existingLink) {
    throw new DHValidationError(
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

/** A link as seen from one of its cards. */
export interface LinkEnd {
  /** The card or external item ("connector:itemKey") at the other end. */
  target: string;
  linkType: string;
  /** 'outbound' (card to target) or 'inbound'; outbound by default. */
  direction?: LinkDirection;
  linkDescription?: string;
}

/** Source and destination of a link of `cardKey`. */
export function linkEnds(cardKey: string, link: LinkEnd): [string, string] {
  return link.direction === 'inbound'
    ? [link.target, cardKey]
    : [cardKey, link.target];
}

// A link description as stored: an empty one is no description.
function descriptionOf(linkDescription?: string): string | undefined {
  return linkDescription || undefined;
}

// Whether two ends name the same link of a card.
function sameLink(a: LinkEnd, b: LinkEnd): boolean {
  return (
    a.target === b.target &&
    a.linkType === b.linkType &&
    (a.direction ?? 'outbound') === (b.direction ?? 'outbound') &&
    descriptionOf(a.linkDescription) === descriptionOf(b.linkDescription)
  );
}

// Whether `cardKey` has exactly this link, description included.
function hasLink(checkout: Checkout, cardKey: string, link: LinkEnd): boolean {
  const description = descriptionOf(link.linkDescription);
  if (isExternalItemKey(link.target)) {
    const [connector, ...rest] = link.target.split(':');
    const externalItemKey = rest.join(':');
    return (findCard(checkout, cardKey).metadata?.externalLinks ?? []).some(
      (l) =>
        l.connector === connector &&
        l.externalItemKey === externalItemKey &&
        l.direction === (link.direction ?? 'outbound') &&
        l.linkType === link.linkType &&
        descriptionOf(l.linkDescription) === description,
    );
  }
  const [source, destination] = linkEnds(cardKey, link);
  return (findCard(checkout, source).metadata?.links ?? []).some(
    (l) =>
      l.cardKey === destination &&
      l.linkType === link.linkType &&
      descriptionOf(l.linkDescription) === description,
  );
}

/**
 * Changes a link of a card. The old link must exist, and is checked before
 * anything is written; a change that changes nothing does nothing. The
 * changed link is added before the old one is removed, so that a duplicate
 * is refused with the old link still in place. An empty description is no
 * description.
 * @param cardKey Card whose link is changed.
 * @param link The link as it is.
 * @param changed The link as it is to be.
 * @throws DHValidationError if the card has no such link, or the changed
 *   link is not allowed or already exists.
 */
export async function editLink(
  checkout: Checkout,
  cardKey: string,
  link: LinkEnd,
  changed: LinkEnd,
) {
  const old = { ...link, linkDescription: descriptionOf(link.linkDescription) };
  const next = {
    ...changed,
    linkDescription: descriptionOf(changed.linkDescription),
  };
  if (!hasLink(checkout, cardKey, old)) {
    throw new DHValidationError(
      `Link of '${cardKey}' to '${old.target}' with link type '${old.linkType}'` +
        (old.linkDescription
          ? ` and description '${old.linkDescription}'`
          : ' and no description') +
        ' not found',
    );
  }
  if (sameLink(old, next)) {
    return;
  }
  await addLink(
    checkout,
    ...linkEnds(cardKey, next),
    next.linkType,
    next.linkDescription,
    next.direction,
  );
  // Exactly the old link: without a description it is no wildcard, which
  // would also remove the changed link and its described siblings.
  await removeLink(
    checkout,
    ...linkEnds(cardKey, old),
    old.linkType,
    old.linkDescription,
    old.direction,
    { exact: true },
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
  { exact = false }: { exact?: boolean } = {},
) {
  const isExternalSource = isExternalItemKey(source);
  const isExternalDestination = isExternalItemKey(destination);

  if (isExternalSource && isExternalDestination) {
    throw new DHValidationError(
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
      exact,
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
    const described =
      !linkDescription &&
      sourceCard.metadata?.links.some(
        (l) =>
          l.cardKey === destination &&
          l.linkType === (linkType ?? '') &&
          l.linkDescription,
      );
    throw new DHValidationError(
      (linkType
        ? `Link from '${source}' to '${destination}' with link type '${linkType}'`
        : `Link from '${source}' to '${destination}'`) +
        (linkDescription ? ` and description '${linkDescription}'` : '') +
        ' not found' +
        (described
          ? '. A link of this type has a description; pass it to remove the link'
          : ''),
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

// Removes external link from project. An omitted link type or description
// matches any, unless `exact`: then they match only the link that has
// exactly them, an omitted description matching only a link without one.
async function removeExternalLink(
  checkout: Checkout,
  cardKey: string,
  externalItem: string,
  direction: 'outbound' | 'inbound',
  linkType?: string,
  linkDescription?: string,
  exact = false,
) {
  // Parse connector:itemKey
  const [connector, ...rest] = externalItem.split(':');
  const externalItemKey = rest.join(':');

  if (!connector || !externalItemKey) {
    throw new DHValidationError(
      `Invalid external item format: '${externalItem}'. Expected 'connector:itemKey'.`,
    );
  }

  const card = findCard(checkout, cardKey);

  const matches = (l: ExternalLink) =>
    l.connector === connector &&
    l.externalItemKey === externalItemKey &&
    l.direction === direction &&
    (exact
      ? l.linkType === linkType &&
        descriptionOf(l.linkDescription) === descriptionOf(linkDescription)
      : (!linkType || l.linkType === linkType) &&
        (!linkDescription || l.linkDescription === linkDescription));

  const extLink = card.metadata?.externalLinks?.find(matches);

  if (!extLink) {
    throw new DHValidationError(
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
