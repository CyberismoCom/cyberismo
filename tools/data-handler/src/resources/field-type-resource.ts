/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import {
  CardType,
  DataType,
  EnumDefinition,
  FieldType,
} from '../interfaces/resource-interfaces.js';
import { CardTypeResource } from './card-type-resource.js';
import { DefaultContent } from '../create-defaults.js';
import { FileResource, Operation } from './file-resource.js';
import { Project, ResourcesFrom } from '../containers/project.js';
import {
  ResourceName,
  resourceName,
  resourceNameToString,
} from '../utils/resource-utils.js';

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

  // Update dependant card types
  private async updateCardTypes(oldName: string) {
    const cardTypes = await this.project.cardTypes(ResourcesFrom.localOnly);
    const operation: Operation = {
      operation: 'rename',
      from: oldName,
      to: this.content.name,
    };
    for (const cardType of cardTypes) {
      const object = new CardTypeResource(
        this.project,
        resourceName(cardType.name),
      );
      const data = object.data as CardType;
      const found = data.customFields.find((item) => item.name === oldName);
      if (found) {
        await object.update('customFields', [], operation);
      }
    }
  }

  /**
   * Returns all possible field types.
   * @returns
   */
  public static fieldTypes(): string[] {
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
   * Creates a new field type object. Base class writes the object to disk automatically.
   * @param dataType Type for the new field type.
   */
  public async createFieldType(dataType: string) {
    if (!FieldTypeResource.fieldTypes().includes(dataType)) {
      throw new Error(
        `Field type '${dataType}' not supported. Supported types ${FieldTypeResource.fieldTypes().join(', ')}`,
      );
    }

    const useDataType: DataType = dataType as DataType;
    const content = DefaultContent.fieldType(
      resourceNameToString(this.resourceName),
      useDataType,
    );
    return super.create(content);
  }

  /**
   * Deletes file(s) from disk and clears out the memory resident object.
   */
  public async delete() {
    return super.delete();
  }

  /**
   * Renames resource metadata file and renames memory resident object 'name'.
   * @param newName New name for the resource.
   */
  public async rename(newName: ResourceName) {
    const oldName = this.content.name;
    await super.rename(newName);
    return this.updateCardTypes(oldName);
  }

  /**
   * Shows metadata of the resource.
   * @returns field type metadata.
   */
  public async show(): Promise<FieldType> {
    return super.show() as unknown as FieldType;
  }

  /**
   * Updates field type resource.
   * @param key Key to modify
   * @param value New value.
   */
  public async update<Type>(key: string, value: Type, _op?: Operation) {
    const nameChange = key === 'name';
    const existingName = this.content.name;
    await super.update(key, value, _op);

    const fieldTypeContent = this.content as unknown as FieldType;
    if (key === 'name') {
      fieldTypeContent.name = value as string;
    } else if (key === 'dataType') {
      fieldTypeContent.dataType = value as DataType;
    } else if (key === 'displayName') {
      fieldTypeContent.displayName = value as string;
    } else if (key === 'enumValues') {
      fieldTypeContent.enumValues = value as EnumDefinition[];
    } else if (key === 'fieldDescription') {
      fieldTypeContent.fieldDescription = value as string;
    } else {
      throw new Error(`Unknown property '${key}' for FieldType`);
    }

    await super.postUpdate(fieldTypeContent, key, value);

    // After this resource has been updated, update the dependents.
    if (nameChange) {
      await this.updateCardTypes(existingName);
      await super.updateHandleBars(existingName, this.content.name);
      await super.updateCalculations(existingName, this.content.name);
    }
  }

  /**
   * Validates the resource. If object is invalid, throws.
   */
  public async validate() {
    return super.validate();
  }
}
