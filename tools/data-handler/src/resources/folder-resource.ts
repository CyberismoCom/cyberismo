/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { join } from 'node:path';
import { mkdir, rm } from 'node:fs/promises';

import { FileResource, Operation } from './file-resource.js';
import { Project } from '../containers/project.js';
import { ResourceContent } from '../interfaces/resource-interfaces.js';
import { ResourceFolderType } from '../interfaces/project-interfaces.js';
import { ResourceName } from '../utils/resource-utils.js';

export { type Operation };

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
    await rm(this.internalFolder, { recursive: true, force: true });
    return super.delete();
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
   * Writes resource content to disk.
   */
  protected async write() {
    return super.write();
  }

  /**
   * Validates the resource. If object is invalid, throws.
   */
  protected async validate(content?: object) {
    return super.validate(content);
  }
}
