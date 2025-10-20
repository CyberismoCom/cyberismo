/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import type { CardMetadata } from './interfaces/project-interfaces.js';
import { FieldTypeResource } from './resources/field-type-resource.js';
import { getChildLogger } from './utils/log-utils.js';
import type { Project } from './containers/project.js';
import type { UpdateField } from './types/queries.js';

/**
 * Card metadata update result.
 */
interface CardUpdateResult {
  success: boolean;
  errors: string[];
}

/**
 * Handles the updating of card metadata from clingo query result.
 *
 * todo: Once 'Card' class is created, the functionality in this class
 *       can be incorporated there and this class can be removed.
 */
export class CardMetadataUpdater {
  private static get logger() {
    return getChildLogger({
      module: 'cardMetadataUpdater',
    });
  }
  /**
   * Applies a given array of changes to card(s).
   * @param project Current project.
   * @param fieldsToUpdate Array of field updates. Each update consists of cardKey, fieldName and new value.
   */
  public static async apply(
    project: Project,
    fieldsToUpdate: UpdateField[],
  ): Promise<void> {
    if (!fieldsToUpdate || fieldsToUpdate.length === 0) {
      return;
    }
    const updates = CardMetadataUpdater.groupChangesByCard(fieldsToUpdate);
    const updatePromises: Promise<CardUpdateResult>[] = [];

    for (const [cardKey, changes] of updates.entries()) {
      updatePromises.push(
        CardMetadataUpdater.updateCardMetadata(project, cardKey, changes),
      );
    }

    const results = await Promise.all(updatePromises);
    CardMetadataUpdater.reportErrors(results);
  }

  // Applies a single field change to a card's metadata.
  private static async applyFieldChange(
    project: Project,
    metadata: CardMetadata,
    change: UpdateField,
  ): Promise<CardUpdateResult> {
    const result: CardUpdateResult = {
      success: true,
      errors: [],
    };

    if (change.field === 'title' || change.field === 'workflowState') {
      metadata[change.field] = FieldTypeResource.fromClingoResult(
        change.newValue,
        'shortText',
      );
      return result;
    }

    if (change.field === 'cardType' || change.field === 'rank') {
      result.success = false;
      result.errors.push(
        `For card ${change.card} cannot change card's ${change.field}.`,
      );
      return result;
    }

    const fieldType = await project.resources
      .byType(change.field, 'fieldTypes')
      .show();
    if (!fieldType) {
      result.success = false;
      result.errors.push(
        `Field type '${change.field}' from transition change does not exist in the project.`,
      );
      return result;
    }

    metadata[change.field] = FieldTypeResource.fromClingoResult(
      change.newValue,
      fieldType.dataType,
    );

    return result;
  }

  // Groups changes by card key. Returns grouped map. Mapping is by cardKey.
  private static groupChangesByCard(
    fieldsToUpdate: UpdateField[],
  ): Map<string, UpdateField[]> {
    const updatesByCardKey = new Map<string, UpdateField[]>();

    fieldsToUpdate.forEach((change) => {
      const cardKey = change.card;
      if (!updatesByCardKey.has(cardKey)) {
        updatesByCardKey.set(cardKey, []);
      }

      const cardChanges = updatesByCardKey.get(cardKey);
      if (cardChanges) {
        cardChanges.push({
          field: change.field,
          card: change.card,
          newValue: change.newValue,
        });
      }
    });

    return updatesByCardKey;
  }

  // Reports errors from update operations to the logger.
  private static reportErrors(results: CardUpdateResult[]) {
    const allErrors = results
      .filter((result) => !result.success)
      .flatMap((result) => result.errors);

    if (allErrors.length > 0) {
      allErrors.push('On transition change to card(s) can not be applied.');
      this.logger.error(allErrors.join('\n'));
    }
  }

  // Updates a single card's metadata with the provided changes.
  private static async updateCardMetadata(
    project: Project,
    cardKey: string,
    changes: UpdateField[],
  ): Promise<CardUpdateResult> {
    const result: CardUpdateResult = {
      success: true,
      errors: [],
    };

    const card = project.findCard(cardKey);
    if (!card || !card.metadata) {
      result.success = false;
      result.errors.push(
        `Card ${cardKey} does not exist in the project. Changes cannot be applied.`,
      );
      return result;
    }

    const updatePromises = changes.map((change) =>
      CardMetadataUpdater.applyFieldChange(project, card.metadata!, change),
    );
    const updateResults = await Promise.all(updatePromises);

    for (const updateResult of updateResults) {
      if (!updateResult.success) {
        result.success = false;
        result.errors.push(...updateResult.errors);
      }
    }

    if (result.success) {
      await project.updateCardMetadata(card, card.metadata);
    }
    return result;
  }
}
