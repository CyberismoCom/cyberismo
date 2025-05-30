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
  ChangeOperation,
  Operation,
  Project,
  RemoveOperation,
  ResourceName,
} from './file-resource.js';
import {
  DefaultContent,
  FileResource,
  ResourcesFrom,
  resourceName,
  resourceNameToString,
  sortCards,
} from './file-resource.js';

import type {
  CardType,
  DataType,
  EnumDefinition,
  FieldType,
} from '../interfaces/resource-interfaces.js';
import { CardTypeResource } from './card-type-resource.js';
import {
  allowed,
  fromDate,
  fromNumber,
  fromString,
} from '../utils/value-utils.js';
import * as EmailValidator from 'email-validator';

const SHORT_TEXT_MAX_LENGTH = 80;

/**
 * Field type resource class.
 */
export class FieldTypeResource extends FileResource {
  // Initialize data type change helpers (fromType, toType) to some values.
  // The actual types are set, if this Field Type's dataType is changed.
  private fromType: DataType = 'integer';
  private toType: DataType = 'integer';

  constructor(project: Project, name: ResourceName) {
    super(project, name, 'fieldTypes');

    this.contentSchemaId = 'fieldTypeSchema';
    this.contentSchema = super.contentSchemaContent(this.contentSchemaId);

    this.initialize();
  }

  // Cards from given array that include this field type.
  private cardsWithFieldType(cards: Card[]): string[] {
    const resourceName = resourceNameToString(this.resourceName);
    return cards
      .filter((card) => card.metadata?.[resourceName])
      .map((card) => card.key);
  }

  // Converts values.
  // The allowed conversions are:
  // - shortText/longText --> person, if valid email
  // - shortText/longText --> integer/number, if can be parseNumber/parseInt'd
  // - shortText/longText --> list, if text can be split with comma
  // - shortText/longText --> date / datetime (if it can be parsed as date)
  // - shortText/longText --> boolean, if string is "false" or "true"
  // - number --> integer, drop fractions
  // - integer --> number
  // - date --> dateTime
  // - dateTime --> date
  // - any --> shortText, unless too long
  // - any --> longText
  // Other cases are forbidden.
  private doConvertValue<T>(value: T) {
    if (this.fromType === 'date' || this.fromType === 'dateTime') {
      return fromDate(value, this.toType);
    }
    if (this.fromType === 'integer' || this.fromType === 'number') {
      return fromNumber(value, this.toType);
    }
    if (this.fromType === 'shortText' || this.fromType === 'longText') {
      return fromString(value, this.toType);
    }
    if (this.toType === 'shortText' || this.toType === 'longText') {
      let tempValue = String(value);
      tempValue = tempValue.replace(/(\\")/g, '');
      if (
        this.toType === 'shortText' &&
        tempValue.length > SHORT_TEXT_MAX_LENGTH
      ) {
        return null;
      }
      return tempValue;
    }
  }

  // Converts value 'fromType' to 'toType'. If value cannot be converted returns null.
  private convertValue<T>(value: T) {
    if (value === null) return null;
    if (value === undefined) return undefined;

    const tempValue = this.doConvertValue(value);
    if (tempValue === null) {
      throw new Error(
        `Cannot convert from '${this.fromType}' to '${this.toType}' value '${value}'`,
      );
    }
    return tempValue;
  }

  // If dataType has changed, convert all the cards with affected data.
  private async dataTypeChanged() {
    const cardTypesThatUseThisFieldType: string[] = [];

    // Helper to filter out the unwanted cards.
    function affectedCard(card: Card): boolean {
      if (!card.metadata) return false;
      return cardTypesThatUseThisFieldType.some(
        (item) => item === card.metadata!.cardType,
      );
    }

    // First collect the cardTypes that need to be updated.
    const cardTypes = await this.relevantCardTypes(ResourcesFrom.localOnly);
    cardTypesThatUseThisFieldType.push(...cardTypes);

    // Then collect cards (both project and local template) that use those card types.
    const projectCards = (
      await this.project.cards(this.project.paths.cardRootFolder, {
        metadata: true,
      })
    ).filter((card) => affectedCard(card));
    const templateCards = (await this.project.allTemplateCards())
      .filter((card) => !card.path.includes('modules'))
      .filter((card) => affectedCard(card));
    const allCards = [...projectCards, ...templateCards];

    // Finally, convert values and update the cards.
    allCards.forEach(async (card) => {
      const metadata = card.metadata!;
      const fieldName = resourceNameToString(this.resourceName);
      try {
        metadata[fieldName] = this.convertValue(metadata[fieldName]);
        // Either value was already null, or couldn't convert.
        if (metadata[fieldName] === null) return;

        await this.project.updateCardMetadata(card, metadata);
      } catch (error) {
        console.error(
          `In card '${card.key}': ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  }

  // Checks that enum with 'enumValue' exists.
  private enumValueExists<Type>(op: Operation<Type>, values: Type[]) {
    const targetValue = (op as Operation<EnumDefinition>).target;
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
      const foundTo = values.find(
        (item) => (item as EnumDefinition).enumValue === newValue.enumValue,
      );
      if (foundTo) {
        throw new Error(
          `Cannot perform operation on 'enumValues'. Enum with value '${(op.to as EnumDefinition).enumValue}' already exists`,
        );
      }
    }
    // Return the whole object; caller can just provide 'enumValue'.
    return foundTarget;
  }

  // If enum value is removed, and replacement value is given; replace all
  // references to removed enum value with the given replacement value.
  private async handleEnumValueReplacements<Type>(op: Operation<Type>) {
    const removeOp = op as RemoveOperation<Type>;
    const newValue = removeOp.replacementValue as EnumDefinition;
    if (!newValue) return;

    const removedValue = (op.target as EnumDefinition).enumValue;
    const cardTypes = await this.relevantCardTypes(ResourcesFrom.localOnly);
    const allCards = await Promise.all(
      cardTypes.map((cardType) =>
        this.collectCards({ metadata: true }, cardType),
      ),
    );
    const cardsToUpdate = allCards
      .flat()
      .filter((card) => card.metadata?.[this.content.name] === removedValue);

    await Promise.all(
      cardsToUpdate.map((card) =>
        this.project.updateCardMetadataKey(
          card.key,
          this.content.name,
          newValue.enumValue,
        ),
      ),
    );
  }

  // When resource name changes.
  private async handleNameChange(existingName: string) {
    await Promise.all([
      super.updateHandleBars(existingName, this.content.name),
      super.updateCalculations(existingName, this.content.name),
    ]);
    await this.write();
  }

  // Checks if value 'from' can be converted 'to' value.
  private isConversionValid(from: DataType, to: DataType) {
    // Set helpers to avoid dragging 'Operation' object everywhere.
    this.fromType = from;
    this.toType = to;

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
  private async relevantCardTypes(from: ResourcesFrom): Promise<string[]> {
    const resourceName = resourceNameToString(this.resourceName);
    const cardTypes = await this.project.cardTypes(from);

    const references = await Promise.all(
      cardTypes.map(async (cardType) => {
        const metadata = await this.project.resource<CardType>(cardType.name);
        return metadata?.customFields.some(
          (field) => field.name === resourceName,
        )
          ? cardType.name
          : '';
      }),
    );
    // Remove empty values.
    return references.filter(Boolean);
  }

  // Update dependant card types
  private async updateCardTypes(oldName: string) {
    const cardTypes = await this.project.cardTypes(ResourcesFrom.localOnly);
    const op = {
      name: 'change',
      target: oldName,
      to: this.content.name,
    } as ChangeOperation<string>;
    for (const cardType of cardTypes) {
      const object = new CardTypeResource(
        this.project,
        resourceName(cardType.name),
      );
      const data = object.data as CardType;
      if (data) {
        const found = data.customFields
          ? data.customFields.find((item) => item.name === oldName)
          : undefined;
        if (found) {
          await object.update('customFields', op);
        }
      }
    }
  }

  /**
   * Creates a new field type object. Base class writes the object to disk automatically.
   * @param dataType Type for the new field type.
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
   * Returns content data.
   */
  public get data(): FieldType {
    return super.data as FieldType;
  }

  /**
   * Deletes file(s) from disk and clears out the memory resident object.
   */
  public async delete() {
    return super.delete();
  }

  /**
   * Returns all possible field types.
   * @returns all possible field types.
   */
  public static fieldDataTypes(): DataType[] {
    return [
      'shortText',
      'longText',
      'number',
      'integer',
      'boolean',
      'enum',
      'list',
      'date',
      'dateTime',
      'person',
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
   * Renames resource metadata file and renames memory resident object 'name'.
   * @param newName New name for the resource.
   */
  public async rename(newName: ResourceName) {
    const existingName = this.content.name;
    await super.rename(newName);
    return this.handleNameChange(existingName);
  }

  /**
   * Shows metadata of the resource.
   * @returns field type metadata.
   */
  public async show(): Promise<FieldType> {
    return super.show() as Promise<FieldType>;
  }

  /**
   * Updates field type resource.
   * @param key Key to modify
   * @param op Operation to perform on 'key'
   */
  public async update<Type>(key: string, op: Operation<Type>) {
    const nameChange = key === 'name';
    const typeChange = key === 'dataType';
    const enumChange = key === 'enumValues';
    const existingName = this.content.name;
    const existingType = (this.content as FieldType).dataType;

    await super.update(key, op);

    const content = this.content as FieldType;
    if (key === 'name') {
      content.name = super.handleScalar(op) as string;
    } else if (key === 'dataType') {
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
    } else if (key === 'displayName') {
      content.displayName = super.handleScalar(op) as string;
    } else if (key === 'enumValues') {
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
    } else if (key === 'fieldDescription') {
      content.fieldDescription = super.handleScalar(op) as string;
    } else {
      throw new Error(`Unknown property '${key}' for FieldType`);
    }

    await super.postUpdate(content, key, op);

    if (nameChange) {
      // Renaming this field type causes that references to its name must be updated.
      await this.handleNameChange(existingName);
      await this.updateCardTypes(existingName);
    } else if (typeChange) {
      await this.dataTypeChanged();
    } else if (enumChange && op.name === 'remove') {
      await this.handleEnumValueReplacements(op);
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
    const allCards = cards ?? (await super.cards());

    const [cardContentReferences, relevantLinkTypes, calculations] =
      await Promise.all([
        super.usage(allCards),
        this.relevantCardTypes(ResourcesFrom.all),
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

  /**
   * Validates the resource. If object is invalid, throws.
   */
  public async validate(content?: object) {
    return super.validate(content);
  }
}
