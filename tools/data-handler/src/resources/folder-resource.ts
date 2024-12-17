/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// node
import { join } from 'node:path';
import { rename } from 'node:fs/promises';

import { readJsonFile, readJsonFileSync } from '../utils/json.js';
import { deleteDir, pathExists } from '../utils/file-utils.js';
import {
  FolderResources,
  ResourceBaseMetadata,
} from '../interfaces/resource-interfaces.js';
import { Project } from '../containers/project.js';
import { ResourceName } from '../utils/resource-utils.js';
import { ResourceObject } from './resource-object.js';

/**
 * Base class for folder based resources (templates, reports)
 */
export class FolderResource extends ResourceObject {
  public folderName: string;
  public fileName: string;
  public content: ResourceBaseMetadata = { name: '' };

  constructor(project: Project, resourceName: ResourceName) {
    super(project, resourceName);
    this.folderName = '';
    this.fileName = '';
  }

  // todo: Call this something else - second phase constructor? 'construct()'?
  protected setResourceFolder() {
    if (this.type) {
      this.resourceFolder = this.project.paths.resourcePath(
        super.singularType(this.type),
      );
      this.resourceName.type = this.type;
      this.resourceName.prefix = this.project.projectPrefix;
      this.folderName = join(this.resourceFolder, this.resourceName.identifier);
      this.moduleResource =
        this.resourceName.prefix !== this.project.projectPrefix;
    }
    const fullPath = join(this.folderName, this.fileName);
    if (pathExists(fullPath)) {
      this.content = readJsonFileSync(fullPath);
    }
  }

  // Creates resource.
  /* eslint-disable @typescript-eslint/no-unused-vars */
  protected async create(newContent: FolderResources) {
    if (pathExists(this.folderName)) {
      throw new Error(
        `Resource '${this.resourceName.identifier}' already exists`,
      );
    }
    await this.validate();
  }

  // Returns memory resident data as JSON.
  // This is basically same as 'show' but doesn't do any checks; just returns the current content.
  public get data() {
    return this.content.name !== '' ? this.content : undefined;
  }

  // Deletes resource.
  protected async delete() {
    if (!pathExists(this.folderName)) {
      throw new Error(
        `Resource '${this.resourceName.identifier}' does not exist`,
      );
    }
    await deleteDir(this.folderName);
    this.folderName = '';
  }

  // Renames resource.
  protected async rename(newName: ResourceName) {
    if (!pathExists(this.folderName)) {
      throw new Error(
        `Resource '${this.resourceName.identifier}' does not exist`,
      );
    }
    if (newName.prefix !== this.project.projectPrefix) {
      throw new Error('Can only rename project resources');
    }
    if (newName.type !== this.resourceName.type) {
      throw new Error('Cannot change resource type');
    }
    const newFoldername = join(
      this.project.basePath,
      this.project.paths.resourcePath(super.singularType(newName.type)),
      newName.identifier,
    );
    if (pathExists(newFoldername)) {
      throw new Error(`Resource '${newFoldername}' already exists`);
    }
    await rename(this.folderName, newFoldername);
    this.folderName = newFoldername;
    const content = await readJsonFile(newFoldername);
    content.name = newName.identifier;
  }

  protected async show(): Promise<FolderResources> {
    return {} as unknown as FolderResources;
  }

  protected async validate() {
    // - validates resource name
  }
}
