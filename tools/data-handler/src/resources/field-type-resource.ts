/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import {
  Card,
  ChangeOperation,
  DefaultContent,
  FileResource,
  Operation,
  Project,
  ResourcesFrom,
  resourceName,
  resourceNameToString,
  ResourceName,
  sortCards,
} from './file-resource.js';
import {
  CardType,
  DataType,
  EnumDefinition,
  FieldType,
} from '../interfaces/resource-interfaces.js';
import { CardTypeResource } from './card-type-resource.js';
import * as EmailValidator from 'email-validator';

/**
 * Field type resource class.
 *
 */
export class FieldTypeResource extends FileResource {
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

  // When resource name changes.
  private async handleNameChange(existingName: string) {
    await Promise.all([
      super.updateHandleBars(existingName, this.content.name),
      super.updateCalculations(existingName, this.content.name),
    ]);
    // Finally, write updated content.
    await this.write();
  }

  // Converts clingo array: "(option1, option2)" => ['option1', 'option2']
  private static parseClingoArray(value: string) {
    const itemsFromParenthesesList = /([^,()]+)/g;
    const results = value.match(itemsFromParenthesesList);
    if (!results) return [];
    return results.map((item) => item.trim());
  }

  // Card types that use field type.
  private async relevantCardTypes(): Promise<string[]> {
    const resourceName = resourceNameToString(this.resourceName);
    const cardTypes = await this.project.cardTypes(ResourcesFrom.all);

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
  public async createFieldType(dataType: string) {
    if (!FieldTypeResource.fieldDataTypes().includes(dataType)) {
      throw new Error(
        `Field type '${dataType}' not supported. Supported types ${FieldTypeResource.fieldDataTypes().join(', ')}`,
      );
    }

    const useDataType = dataType as DataType;
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
   * todo: should return 'DataType' array instead of string array
   */
  public static fieldDataTypes(): string[] {
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
    const existingName = this.content.name;
    const existingType = (this.content as FieldType).dataType;

    await super.update(key, op);

    const content = this.content as FieldType;
    if (key === 'name') {
      content.name = super.handleScalar(op) as string;
    } else if (key === 'dataType') {
      const toType = op as ChangeOperation<string>;
      if (!FieldTypeResource.fieldDataTypes().includes(toType.to)) {
        throw new Error(
          `Cannot change '${key}' to unknown type '${toType.to}'`,
        );
      }
      if (existingType === content.dataType) {
        throw new Error(`'${key}' is already '${toType.to}'`);
      }
      // @todo: handle supported datatype changes:
      // shortText/longText --> person (if valid email)
      // shortText/longText --> integer/number (if can be parseNumber/parseInt'd)
      // shortText/longText --> list, if text can be split with comma (we could potentially bring the separator character as additional detail)
      // shortText/longText --> date / datetime (if it can be parsed as date)
      // shortText/longText --> boolean ?  if string is "false" or "true"
      // number --> integer (drop fractions)
      // integer --> number
      // any --> shortText (unless too long)
      // any --> longText
      // other cases are verboten

      content.dataType = super.handleScalar(op) as DataType;
    } else if (key === 'displayName') {
      content.displayName = super.handleScalar(op) as string;
    } else if (key === 'enumValues') {
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

    // Renaming this field type causes that references to its name must be updated.
    if (nameChange) {
      await this.handleNameChange(existingName);
      await this.updateCardTypes(existingName);
    } else if (typeChange) {
      // @todo: fetch all cardTypes that use this FT, then fetch all cards that use those CTs and update ALL the values.
      console.error('all affected card types cards should be updated');
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
        this.relevantCardTypes(),
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
