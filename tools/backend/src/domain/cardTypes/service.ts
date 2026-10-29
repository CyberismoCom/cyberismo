// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import {
  ResourceNotFoundError,
  resourceName,
  type Workspace,
} from '@cyberismo/data-handler';
import type { VisibilityGroup, FieldVisibilityBody } from './schema.js';

export async function getCardTypes(ws: Workspace) {
  const cardTypesWithDetails = await ws.resources.contents('cardTypes');
  return cardTypesWithDetails;
}

export async function createCardType(
  ws: Workspace,
  cardTypeName: string,
  workflowName: string,
) {
  await ws.resources.create(cardTypeName, 'cardTypes', {
    workflow: workflowName,
  });
}

const groupToKey: Record<Exclude<VisibilityGroup, 'hidden'>, string> = {
  always: 'alwaysVisibleFields',
  optional: 'optionallyVisibleFields',
};

function getCurrentGroup(
  alwaysVisibleFields: string[],
  optionallyVisibleFields: string[],
  fieldName: string,
): VisibilityGroup {
  if (alwaysVisibleFields.includes(fieldName)) return 'always';
  if (optionallyVisibleFields.includes(fieldName)) return 'optional';
  return 'hidden';
}

/**
 * Update field visibility for a card type.
 * Handles moving fields between visibility groups and reordering within groups.
 */
export async function updateFieldVisibility(
  ws: Workspace,
  cardTypeName: string,
  body: FieldVisibilityBody,
): Promise<void> {
  const { fieldName, group: targetGroup, index: targetIndex } = body;
  const target = resourceName(cardTypeName);

  await ws.atomic(async () => {
    // Read is now inside the write lock
    const cardType = await ws.resources.show(cardTypeName, 'cardTypes');
    if (!cardType) {
      throw new Error(`Card type '${cardTypeName}' not found`);
    }

    const customFields = cardType.customFields || [];
    const alwaysVisibleFields = cardType.alwaysVisibleFields || [];
    const optionallyVisibleFields = cardType.optionallyVisibleFields || [];

    // Validate that the field exists in customFields
    const fieldExists = customFields.some(
      (f: { name: string }) => f.name === fieldName,
    );
    if (!fieldExists) {
      throw new ResourceNotFoundError(
        fieldName,
        `Field '${fieldName}' does not exist in card type '${cardTypeName}'. `,
      );
    }

    const currentGroup = getCurrentGroup(
      alwaysVisibleFields,
      optionallyVisibleFields,
      fieldName,
    );

    // If same group, just handle reordering
    if (currentGroup === targetGroup) {
      if (targetGroup !== 'hidden' && targetIndex !== undefined) {
        await ws.changes.apply({
          kind: 'edit',
          target,
          updateKey: { key: groupToKey[targetGroup] },
          operation: { name: 'rank', target: fieldName, newIndex: targetIndex },
        });
      }
      return;
    }

    // Remove from current group (if not hidden)
    if (currentGroup !== 'hidden') {
      await ws.changes.apply({
        kind: 'edit',
        target,
        updateKey: { key: groupToKey[currentGroup] },
        operation: { name: 'remove', target: fieldName },
      });
    }

    // Add to new group (if not hidden)
    if (targetGroup !== 'hidden') {
      await ws.changes.apply({
        kind: 'edit',
        target,
        updateKey: { key: groupToKey[targetGroup] },
        operation: { name: 'add', target: fieldName },
      });

      if (targetIndex !== undefined) {
        await ws.changes.apply({
          kind: 'edit',
          target,
          updateKey: { key: groupToKey[targetGroup] },
          operation: { name: 'rank', target: fieldName, newIndex: targetIndex },
        });
      }
    }
  }, `Update field visibility for ${cardTypeName}`);
}
