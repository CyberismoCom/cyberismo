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

import type { Handler, MutationContext } from '../handler.js';
import type { EditInput } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';
import { fromDate, fromNumber, fromString } from '../../utils/value-utils.js';
import { isModuleCard } from '../../utils/card-utils.js';
import type {
  Card,
  MetadataContent,
} from '../../interfaces/project-interfaces.js';
import type { DataType } from '../../interfaces/resource-interfaces.js';

const SHORT_TEXT_MAX_LENGTH = 80;

/**
 * Changing a field type's data type is a breaking change: every card carrying
 * the field has its value converted to the new type. FieldTypeResource.update
 * validates the conversion and persists the new dataType; the handler then owns
 * the per-card value conversion. Marked breaking.
 */
export class FieldTypeDataTypeHandler implements Handler<EditInput> {
  async apply(ctx: MutationContext<EditInput>): Promise<void> {
    const fieldName = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(fieldName, 'fieldTypes');
    if (!resource) {
      throw new Error(`Field type '${fieldName}' not found`);
    }

    // Validate the conversion and persist the new dataType
    // (FieldTypeResource.update throws on a disallowed conversion).
    await resource.update(ctx.input.updateKey, ctx.input.operation);

    await this.applyCascade(ctx);
  }

  // Cascade: convert every affected card's value to the new type. Old and new
  // types come from the operation (target/to), not from the resource.
  async applyCascade(ctx: MutationContext<EditInput>): Promise<void> {
    const fieldName = resourceNameToString(ctx.input.target);
    const op = ctx.input.operation as { target: DataType; to: DataType };
    const fromType = op.target;
    const toType = op.to;

    for (const card of this.affectedCards(ctx, fieldName)) {
      const metadata = card.metadata!;
      try {
        const converted = this.convertValue(
          metadata[fieldName],
          fromType,
          toType,
        );
        // Conversion indeterminate — leave the card untouched.
        if (converted === null || converted === undefined) continue;
        metadata[fieldName] = converted as MetadataContent;
        await ctx.project.updateCardMetadata(card, metadata);
      } catch (error) {
        console.error(
          `In card '${card.key}': ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  // Local project cards plus local (non-module) template cards that hold a
  // value under this field. Selection is by the metadata KEY, not by the
  // (possibly-renamed) card type name: a card type rename elsewhere in the
  // same update must not hide a card from this cascade.
  private affectedCards(ctx: MutationContext, fieldName: string): Card[] {
    const holdsField = (card: Card): boolean =>
      card.metadata != null && fieldName in card.metadata;

    const projectCards = ctx.project
      .cards(ctx.project.paths.cardRootFolder)
      .filter(holdsField);
    const templateCards = ctx.project
      .allTemplateCards()
      .filter((card) => !isModuleCard(card))
      .filter(holdsField);
    return [...projectCards, ...templateCards];
  }

  // Converts a value from one data type to another. Returns null if the value
  // cannot be converted; throws on an unsupported conversion.
  private convertValue<T>(value: T, fromType: DataType, toType: DataType) {
    if (value === null) return null;
    if (value === undefined) return undefined;

    const converted = this.doConvertValue(value, fromType, toType);
    if (converted === null) {
      throw new Error(
        `Cannot convert from '${fromType}' to '${toType}' value '${value}'`,
      );
    }
    return converted;
  }

  private doConvertValue<T>(value: T, fromType: DataType, toType: DataType) {
    if (fromType === 'date' || fromType === 'dateTime') {
      return fromDate(value, toType);
    }
    if (fromType === 'integer' || fromType === 'number') {
      return fromNumber(value, toType);
    }
    if (fromType === 'shortText' || fromType === 'longText') {
      return fromString(value, toType);
    }
    if (toType === 'shortText' || toType === 'longText') {
      let tempValue = String(value);
      tempValue = tempValue.replace(/(\\")/g, '');
      if (toType === 'shortText' && tempValue.length > SHORT_TEXT_MAX_LENGTH) {
        return null;
      }
      return tempValue;
    }
  }
}
