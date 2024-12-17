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

  // When resource name changes.
  private async doHandleNameChange(existingName: string) {
    await Promise.all([
      await this.updateCardTypes(existingName),
      await super.updateHandleBars(existingName, this.content.name),
      await super.updateCalculations(existingName, this.content.name),
    ]);
  }

  // Update dependant card types
  private async updateCardTypes(oldName: string) {
    const cardTypes = await this.project.cardTypes(ResourcesFrom.localOnly);
    const op: Operation<string> = {
      name: 'change',
      from: oldName,
      to: this.content.name,
    };
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
   * Returns all possible field types.
   * @returns all possible field types.
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

    const useDataType = dataType as DataType;
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
    const existingName = this.content.name;
    await super.rename(newName);
    return this.doHandleNameChange(existingName);
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
   * @param op
   */
  public async update<Type>(key: string, op: Operation<Type>) {
    const nameChange = key === 'name';
    const existingName = this.content.name;
    await super.update(key, op);

    const content = this.content as FieldType;
    if (key === 'name') {
      content.name = super.handleScalar(op) as string;
    } else if (key === 'dataType') {
      content.dataType = super.handleScalar(op) as DataType;
    } else if (key === 'displayName') {
      content.displayName = super.handleScalar(op) as string;
    } else if (key === 'enumValues') {
      // @todo - does this work?
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

    // After this resource has been updated, update the dependents.
    if (nameChange) {
      await this.doHandleNameChange(existingName);
    }
  }

  /**
   * Validates the resource. If object is invalid, throws.
   */
  public async validate(content?: object) {
    return super.validate(content);
  }
}
