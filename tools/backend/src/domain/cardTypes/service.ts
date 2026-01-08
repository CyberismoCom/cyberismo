/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import type { CommandManager } from '@cyberismo/data-handler';
import type { VisibilityGroup, FieldVisibilityBody } from './schema.js';

export async function getCardTypes(commands: CommandManager) {
  const cardTypesWithDetails =
    await commands.showCmd.showCardTypesWithDetails();
  return cardTypesWithDetails;
}

export async function createCardType(
  commands: CommandManager,
  cardTypeName: string,
  workflowName: string,
) {
  await commands.createCmd.createCardType(cardTypeName, workflowName);
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
  commands: CommandManager,
  cardTypeName: string,
  body: FieldVisibilityBody,
): Promise<void> {
  const { fieldName, group: targetGroup, index: targetIndex } = body;

  // Get current card type data
  const cardType = await commands.showCmd.showResource(
    cardTypeName,
    'cardTypes',
  );
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
    throw new Error(
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
    if (targetGroup === 'hidden') {
      // Nothing to reorder in hidden group
      return;
    }

    if (targetIndex !== undefined) {
      await commands.updateCmd.applyResourceOperation(
        cardTypeName,
        {
          key: groupToKey[targetGroup],
        },
        {
          name: 'rank',
          target: fieldName,
          newIndex: targetIndex,
        },
      );
    }
    return;
  }

  // Different group - need to remove from old and add to new
  let removedFromOld = false;

  try {
    // Remove from current group (if not hidden)
    if (currentGroup !== 'hidden') {
      await commands.updateCmd.applyResourceOperation(
        cardTypeName,
        {
          key: groupToKey[currentGroup],
        },
        {
          name: 'remove',
          target: fieldName,
        },
      );
      removedFromOld = true;
    }

    // Add to new group (if not hidden)
    if (targetGroup !== 'hidden') {
      await commands.updateCmd.applyResourceOperation(
        cardTypeName,
        {
          key: groupToKey[targetGroup],
        },
        {
          name: 'add',
          target: fieldName,
        },
      );

      // Reorder if index specified
      if (targetIndex !== undefined) {
        await commands.updateCmd.applyResourceOperation(
          cardTypeName,
          {
            key: groupToKey[targetGroup],
          },
          {
            name: 'rank',
            target: fieldName,
            newIndex: targetIndex,
          },
        );
      }
    }
  } catch (error) {
    // Attempt rollback if we removed from old group but failed to add to new
    if (removedFromOld && currentGroup !== 'hidden') {
      try {
        await commands.updateCmd.applyResourceOperation(
          cardTypeName,
          {
            key: groupToKey[currentGroup],
          },
          {
            name: 'add',
            target: fieldName,
          },
        );
      } catch {
        // Rollback failed - log but throw original error
        console.error(
          `Rollback failed for field '${fieldName}' in card type '${cardTypeName}'`,
        );
      }
    }
    throw error;
  }
}
