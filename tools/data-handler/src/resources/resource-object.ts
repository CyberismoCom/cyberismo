/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/* eslint-disable @typescript-eslint/no-unused-vars */

import {
  FileResources,
  FolderResources,
} from '../interfaces/resource-interfaces.js';
import { Project } from '../containers/project.js';
import { ResourceFolderType } from '../interfaces/project-interfaces.js';
import { ResourceName } from '../utils/resource-utils.js';

/**
 * Abstract class for resources.
 *
 */
export abstract class AbstractResource {
  protected abstract calculate(): Promise<void>; // update resource specific calculations
  protected abstract create(
    content?: FileResources | FolderResources,
  ): Promise<void>; // create a new with the content (memory)
  protected abstract delete(): Promise<void>; // delete from disk
  protected abstract read(): Promise<void>; // read content from disk (replaces existing content, if any)
  protected abstract rename(newName: ResourceName): Promise<void>; // change name of the resource and filename; same as update('name', ...)
  protected abstract show(): Promise<FileResources | FolderResources>; // return the content as JSON
  protected abstract update<Type>(key: string, value: Type): Promise<void>; // change one key of resource
  protected abstract validate(): Promise<void>; // validate the content
  protected abstract write(): Promise<void>; // write content to disk
}

/**
 * Base class for all resources.
 */
export class ResourceObject extends AbstractResource {
  protected moduleResource: boolean;
  protected contentSchema: JSON = {} as JSON;
  protected contentSchemaId: string = '';
  protected type: string = '';
  protected resourceFolder: string = '';
  constructor(
    protected project: Project,
    protected resourceName: ResourceName,
  ) {
    super();
    this.moduleResource =
      this.resourceName.prefix !== this.project.projectPrefix;
  }

  protected async calculate() {}
  protected async create(_content?: FileResources | FolderResources) {}
  protected async delete() {}
  protected async read() {}
  protected async rename(_name: ResourceName) {}
  protected async show(): Promise<FileResources | FolderResources> {
    return {} as FileResources;
  }
  protected async update<Type>(_key: string, _value: Type) {}
  protected async validate() {}
  protected async write() {}

  public async updateCardXrefs(from: string, to: string): Promise<JSON> {
    return {} as JSON;
  }
  public async updateCardMacros(from: string, to: string): Promise<JSON> {
    return {} as JSON;
  }
  public async updateCardLinks(from: string, to: string): Promise<JSON> {
    return {} as JSON;
  }

  /**
   * Returns .schema content file.
   * @param schemaId
   * @returns
   */
  public contentSchemaContent(schemaId: string): JSON {
    return [
      {
        id: schemaId,
        version: 1,
      },
    ] as unknown as JSON;
  }

  /**
   * Converts plural type name to singular
   * @type Type name to change.
   * @returns singular format of type name
   */
  public singularType(type: string): ResourceFolderType {
    // note that this only works with certain nouns
    return type.substring(0, type.length - 1) as ResourceFolderType;
  }

  /**
   * Clones a given array and replaces 'oldValue' with 'newValue'
   * @param array Array to update.
   * @param oldValue old value to remove
   * @param newValue new value to add in the index of 'oldValue'
   * @returns cloned array with replaced value
   * @todo - this could be in some util class?
   */
  public updateArray<Type>(
    array: Array<string>,
    oldValue: Type,
    newValue: Type,
  ): Type[] {
    const cloneArray = Object.assign([], array).map((item) => {
      if (item && item === oldValue) {
        return newValue;
      }
      return item;
    });
    return cloneArray;
  }
}
