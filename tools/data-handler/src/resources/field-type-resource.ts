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

import { allowed } from '../utils/value-utils.js';
import { DefaultContent } from './create-defaults.js';
import { FileResource } from './file-resource.js';
import { resourceNameToString } from '../utils/resource-utils.js';
import { sortCards } from '../utils/card-utils.js';

import * as EmailValidator from 'email-validator';

import type { ChangeOperation, Operation } from './resource-object.js';
import type { Card } from '../interfaces/project-interfaces.js';
import type {
  DataType,
  EnumDefinition,
  FieldType,
  UpdateKey,
} from '../interfaces/resource-interfaces.js';
import type { Project } from '../containers/project.js';
import type { ResourceName } from '../utils/resource-utils.js';

/**
 * Field type resource class.
 */
export class FieldTypeResource extends FileResource<FieldType> {
  /**
   * Creates an instance of FieldTypeResource
   * @param project Project to use
   * @param name Resource name
   */
  constructor(project: Project, name: ResourceName) {
    super(project, name, 'fieldTypes');

    this.contentSchemaId = 'fieldTypeSchema';
    this.contentSchema = super.contentSchemaContent(this.contentSchemaId);
  }

  // Cards from given array that include this field type.
  private cardsWithFieldType(cards: Card[]): string[] {
    const resourceName = resourceNameToString(this.resourceName);
    return cards
      .filter((card) => card.metadata?.[resourceName])
      .map((card) => card.key);
  }

  // Checks that enum with 'enumValue' exists.
  private enumValueExists<Type>(op: Operation<Type>, values: Type[]) {
    const targetValue = (op as Operation<EnumDefinition>).target;
    if (targetValue === undefined) {
      throw new Error(
        `Cannot perform operation on 'enumValues'. Operation requires 'target'`,
      );
    }
    const foundTarget = values.find(
      (item) => (item as EnumDefinition).enumValue === targetValue.enumValue,
    );
    if (op.name === 'add' && foundTarget) {
      throw new Error(
        `Cannot perform operation on 'enumValues'. Enum with value '${(op.target as EnumDefinition).enumValue}' already exists`,
      );
    }
    if (op.name === 'remove' && !foundTarget) {
      throw new Error(
        `Cannot perform operation on 'enumValues'. Enum with value '${(op.target as EnumDefinition).enumValue}' does not exist`,
      );
    }
    if (op.name === 'change') {
      if (!foundTarget) {
        throw new Error(
          `Cannot perform operation on 'enumValues'. Enum with value '${(op.target as EnumDefinition).enumValue}' does not exist`,
        );
      }
      const newValue = (op as ChangeOperation<EnumDefinition>).to;
      // Only check for duplicates if the enumValue itself is being changed
      if (newValue.enumValue !== targetValue.enumValue) {
        const foundTo = values.find(
          (item) => (item as EnumDefinition).enumValue === newValue.enumValue,
        );
        if (foundTo) {
          throw new Error(
            `Cannot perform operation on 'enumValues'. Enum with value '${(op.to as EnumDefinition).enumValue}' already exists`,
          );
        }
      }
    }
    // Return the whole object; caller can just provide 'enumValue'.
    return foundTarget;
  }

  // Checks if value 'from' can be converted 'to' value.
  private isConversionValid(from: DataType, to: DataType) {
    return allowed(from, to);
  }

  // Converts clingo array: "(option1, option2)" => ['option1', 'option2']
  private static parseClingoArray(value: string) {
    const itemsFromParenthesesList = /([^,()]+)/g;
    const results = value.match(itemsFromParenthesesList);
    if (!results) return [];
    return results.map((item) => item.trim());
  }

  // Card types that use field type.
  private relevantCardTypes(): string[] {
    const resourceName = resourceNameToString(this.resourceName);
    const cardTypes = this.project.resources.cardTypes();
    const references = [];
    for (const cardType of cardTypes) {
      const found = cardType.data?.customFields.filter(
        (field) => field.name === resourceName,
      );
      if (found && found.length > 0 && cardType.data)
        references.push(cardType.data?.name);
    }
    return references;
  }

  /**
   * Creates a new field type object. Base class writes the object to disk automatically.
   * @param dataType Type for the new field type.
   * @throws if called with unknown data type
   */
  public async createFieldType(dataType: DataType) {
    if (!FieldTypeResource.fieldDataTypes().includes(dataType)) {
      throw new Error(
        `Field type '${dataType}' not supported. Supported types ${FieldTypeResource.fieldDataTypes().join(', ')}`,
      );
    }

    const useDataType = dataType;
    const content = DefaultContent.fieldType(
      resourceNameToString(this.resourceName),
      useDataType,
    );
    return super.create(content);
  }

  /**
   * Returns all possible field types.
   * @returns all possible field types.
   */
  public static fieldDataTypes(): DataType[] {
    return [
      'boolean',
      'date',
      'dateTime',
      'enum',
      'integer',
      'list',
      'longText',
      'number',
      'person',
      'shortText',
    ];
  }

  /**
   * Converts a given 'value' from Clingo result set to a type defined in 'typeName'.
   * @param value Clingo result value (as string) to be converted.
   * @param typeName To which type the 'value' needs to be converted to.
   * @returns converted value.
   */
  public static fromClingoResult(value: string, typeName: DataType) {
    if (!value) return value;
    if (value === 'null') return JSON.parse(value);

    try {
      switch (typeName) {
        case 'list':
          return FieldTypeResource.parseClingoArray(value);
        case 'boolean':
          return value === 'true';
        case 'date': {
          const date = new Date(value).toISOString();
          return date.substring(0, date.indexOf('T'));
        }
        case 'dateTime':
          return new Date(value).toISOString();
        case 'integer':
          return Math.trunc(Number(value));
        case 'number':
          return Number(value);
        case 'person':
          return EmailValidator.validate(value) ? value : null;
        case 'enum':
        case 'shortText':
        case 'longText':
        default:
          return value;
      }
    } catch (error) {
      console.error(
        `Failed to convert value '${value}' to field '${typeName}': ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Updates field type resource.
   * @param updateKey Key to modify
   * @param op Operation to perform on 'key'
   * @throws
   *  - when called with unknown data type
   *  - when called with data type conversion that cannot be done
   *  - when called with unknown property to update
   */
  public async update<Type, K extends string>(
    updateKey: UpdateKey<K>,
    op: Operation<Type>,
  ) {
    const { key } = updateKey;

    if (this.isBaseProperty(key)) {
      await super.update(updateKey, op);
    } else {
      const content = structuredClone(this.content);
      const existingType = this.content.dataType;
      if (key === 'dataType') {
        const toType = op as ChangeOperation<DataType>;
        if (!FieldTypeResource.fieldDataTypes().includes(toType.to)) {
          throw new Error(
            `Cannot change '${key}' to unknown type '${toType.to}'`,
          );
        }
        if (existingType === toType.to) {
          throw new Error(`'${key}' is already '${toType.to}'`);
        }
        if (!this.isConversionValid(content.dataType, toType.to)) {
          throw new Error(
            `Cannot change data type from '${content.dataType}' to '${toType.to}'`,
          );
        }
        content.dataType = super.handleScalar(op) as DataType;
      } else if (key === 'enumValues') {
        // Initialize enumValues array if it doesn't exist
        if (!content.enumValues) {
          content.enumValues = [];
        }
        if (op.name === 'add' || op.name === 'change' || op.name === 'remove') {
          const existingValue = this.enumValueExists<EnumDefinition>(
            op as Operation<EnumDefinition>,
            content.enumValues as EnumDefinition[],
          ) as Type;
          op.target = existingValue ?? op.target;
        }
        content.enumValues = super.handleArray(
          op,
          key,
          content.enumValues as Type[],
        ) as EnumDefinition[];
      } else {
        throw new Error(`Unknown property '${key}' for FieldType`);
      }

      // The dataType-conversion and enum-replacement cascades have moved to the
      // FieldType handlers (FieldTypeDataTypeHandler, FieldTypeEnumRemoveHandler).
      // update() now only validates and persists the resource edit; it no longer
      // rewrites card metadata.
      await super.postUpdate(content, updateKey, op);
    }
  }

  /**
   * List where link type is used.
   * Always returns card key references first, then any resource references and finally calculation references.
   *
   * @param cards Optional. Check these cards for usage of this resource. If undefined, will check all cards.
   * @returns array of card keys, resource names and calculation filenames that refer this resource.
   */
  public async usage(cards?: Card[]): Promise<string[]> {
    const allCards = cards ?? super.cards();

    const relevantLinkTypes = this.relevantCardTypes();

    const [cardContentReferences, calculations] = await Promise.all([
      super.usage(allCards),
      super.calculations(),
    ]);

    const cardReferences = [
      ...this.cardsWithFieldType(allCards),
      ...cardContentReferences,
    ].sort(sortCards);

    // Using Set to avoid duplicate cards
    return [
      ...new Set([...cardReferences, ...relevantLinkTypes, ...calculations]),
    ];
  }
}
