/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { basename, join } from 'node:path';
import { mkdir, rename, rm } from 'node:fs/promises';

import type { ResourceFolderType } from '../interfaces/project-interfaces.js';
import {
  type Card,
  DefaultContent,
  FileResource,
  type Operation,
  Project,
  resourceName,
  type ResourceName,
  resourceNameToString,
  sortCards,
} from './file-resource.js';
import type { ResourceContent } from '../interfaces/resource-interfaces.js';

export {
  type Card,
  DefaultContent,
  FileResource,
  type Operation,
  Project,
  ResourceName,
  resourceNameToString,
  sortCards,
};

/**
 * Folder type resource class. These are resources that have their own folders for content.
 */
export class FolderResource extends FileResource {
  protected internalFolder: string = '';

  constructor(project: Project, name: ResourceName, type: ResourceFolderType) {
    super(project, name, type);
  }

  /**
   * Creates a new folder type object. Base class writes the object to disk automatically.
   * @param newContent Content for the type.
   */
  protected async create(newContent?: ResourceContent) {
    await super.create(newContent);
    await mkdir(this.internalFolder, { recursive: true });
  }

  /**
   * Returns content data.
   */
  public get data() {
    return super.data;
  }

  /**
   * Deletes file(s) from disk and clears out the memory resident object.
   */
  protected async delete() {
    await super.delete();
    await rm(this.internalFolder, { recursive: true, force: true });
  }

  protected initialize(): void {
    super.initialize();

    this.internalFolder = join(
      this.resourceFolder,
      this.resourceName.identifier,
    );
  }

  /**
   * Renames resource metadata file and renames memory resident object 'name'.
   * @param newName New name for the resource.
   */
  protected async rename(newName: ResourceName) {
    return super.rename(newName);
  }

  /**
   * Shows metadata of the resource.
   * @returns resource type's metadata.
   */
  protected async show(): Promise<ResourceContent> {
    return super.show() as Promise<ResourceContent>;
  }

  /**
   * Updates resource.
   * @param key Key to modify
   * @param op Operation to perform on 'key'
   */
  protected async update<Type>(key: string, op: Operation<Type>) {
    return super.update(key, op);
  }

  /**
   * Returns an array of card keys, and/or resource names where this resource is used.
   * @param cards Optional. If defined, only these cards are checked.
   * @returns an array of card keys, and/or resource names where this resource is used.
   */
  protected async usage(cards?: Card[]): Promise<string[]> {
    return super.usage(cards);
  }

  /**
   * Writes resource content to disk.
   */
  protected async write() {
    const folderName = basename(this.internalFolder);

    // Check if "name" has changed. Changing "name" means renaming the file.
    const nameInContent = resourceName(this.content.name).identifier;
    if (folderName !== nameInContent) {
      const newFolderName = join(this.resourceFolder, nameInContent);
      await rename(this.internalFolder, newFolderName);
      this.internalFolder = newFolderName;
    }
    return super.write();
  }

  /**
   * Validates the resource. If object is invalid, throws.
   */
  protected async validate(content?: object) {
    return super.validate(content);
  }
}
