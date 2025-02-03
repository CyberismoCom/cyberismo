/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/* eslint-disable @typescript-eslint/no-unused-vars */

// node
import { basename, join } from 'node:path';
import { mkdir, rename } from 'node:fs/promises';

import { deleteFile, pathExists } from '../utils/file-utils.js';
import {
  ChangeOperation,
  Operation,
  ResourceObject,
} from './resource-object.js';
import { Project } from '../containers/project.js';
import {
  readJsonFile,
  readJsonFileSync,
  writeJsonFile,
} from '../utils/json.js';
import {
  ResourceBaseMetadata,
  ResourceContent,
} from '../interfaces/resource-interfaces.js';
import {
  ResourceName,
  resourceName,
  resourceNameToPath,
  resourceNameToString,
  resourceObjectToResource,
} from '../utils/resource-utils.js';
import { ResourceFolderType } from '../interfaces/project-interfaces.js';
import { Validate } from '../validate.js';

export { type Operation, type ChangeOperation };

/**
 * Base class for file based resources (card types, field types, link types, workflows, ...)
 */
export class FileResource extends ResourceObject {
  public fileName: string = '';

  protected content: ResourceBaseMetadata = { name: '' };

  constructor(
    project: Project,
    resourceName: ResourceName,
    protected type: ResourceFolderType,
  ) {
    super(project, resourceName);
  }

  // Type of resource.
  private resourceType(): ResourceFolderType {
    return this.type as ResourceFolderType;
  }

  // Initialize the resource.
  protected initialize() {
    if (this.resourceName.type === '') {
      this.resourceName.type = this.type;
    }
    if (this.resourceName.prefix === '') {
      this.resourceName.prefix = this.project.projectPrefix;
    }
    if (this.type) {
      this.resourceFolder = this.project.paths.resourcePath(this.type);
      this.fileName = resourceNameToPath(this.project, this.resourceName);
      this.moduleResource =
        this.resourceName.prefix !== this.project.projectPrefix;
    }
    if (pathExists(this.fileName)) {
      this.content = readJsonFileSync(this.fileName);
    }
  }

  // Creates resource.
  protected async create(newContent?: ResourceContent) {
    if (pathExists(this.fileName)) {
      throw new Error(
        `Resource '${this.resourceName.identifier}' already exists in the project`,
      );
    }

    if (this.resourceFolder === '') {
      this.resourceName = resourceName(
        `${this.project.projectPrefix}/${this.type}/${this.resourceName.identifier}`,
      );
      this.resourceFolder = this.project.paths.resourcePath(
        this.resourceName.type as ResourceFolderType,
      );
    }

    const validName = await Validate.getInstance().validResourceName(
      this.resourceType(),
      resourceNameToString(this.resourceName),
      await this.project.projectPrefixes(),
    );

    let validContent = {} as ResourceContent;
    if (newContent) {
      validContent = newContent as unknown as ResourceContent;
      validContent.name = validName;
    }

    this.content = validContent;
    await this.write();

    // Notify project & collector
    this.project.addResource(resourceObjectToResource(this));
  }

  // Returns memory resident data as JSON.
  // This is basically same as 'show' but doesn't do any checks; just returns the current content.
  public get data() {
    return this.content.name !== '' ? this.content : undefined;
  }

  // Deletes resource.
  protected async delete() {
    if (this.moduleResource) {
      throw new Error(`Cannot delete module resources`);
    }
    if (!this.fileName.endsWith('.json')) {
      this.fileName += '.json';
    }
    if (!pathExists(this.fileName)) {
      throw new Error(
        `Resource '${this.resourceName.identifier}' does not exist in the project`,
      );
    }
    await deleteFile(this.fileName);
    this.project.removeResource(resourceObjectToResource(this));
    this.fileName = '';
  }

  protected async validName(newName: ResourceName) {
    const validName = await Validate.getInstance().validResourceName(
      this.resourceType(),
      resourceNameToString(newName),
      await this.project.projectPrefixes(),
    );
    return validName;
  }

  // Called after inherited class has finished 'update' operation.
  protected async postUpdate<Type>(
    content: ResourceContent,
    key: string,
    op: Operation<Type>,
  ) {
    function toValue(op: Operation<Type>) {
      if (op.name === 'rank') return op.newIndex;
      if (op.name === 'add') return op.target;
      if (op.name === 'remove') return op.target;
      if (op.name === 'change') return op.to;
    }

    // Check that new name is valid.
    if (op.name === 'change' && key === 'name') {
      const newName = resourceName(
        (op as ChangeOperation<string>).to as string,
      );
      content.name = await this.validName(newName);
    }

    // Once changes have been made; validate the content.
    try {
      await this.validate(content);
    } catch (error) {
      if (error instanceof Error) {
        const errorValue = typeof op === 'object' ? toValue(op) : op;
        throw new Error(`Cannot ${op.name} '${key}' --> '${errorValue}'`);
      }
    }

    this.content = content;
    await this.write();
  }

  // Reads content from file to memory.
  protected async read() {
    if (pathExists(this.fileName)) {
      this.content = await readJsonFile(this.fileName);
    }
  }

  // Renames resource.
  protected async rename(newName: ResourceName) {
    if (this.moduleResource) {
      throw new Error(`Cannot rename module resources`);
    }
    if (!pathExists(this.fileName)) {
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
    await Validate.getInstance().validResourceName(
      this.resourceType(),
      resourceNameToString(newName),
      await this.project.projectPrefixes(),
    );
    const newFilename = join(
      this.project.paths.resourcePath(newName.type as ResourceFolderType),
      newName.identifier + '.json',
    );
    if (pathExists(newFilename)) {
      throw new Error(`Resource '${newFilename}' already exists`);
    }
    await rename(this.fileName, newFilename);

    this.fileName = newFilename;
    const content = await readJsonFile(newFilename);
    content.name = newName.identifier;
    this.write();
  }

  // Show resource data as JSON.
  protected async show(): Promise<ResourceContent> {
    if (!pathExists(this.fileName)) {
      const resourceType = `${this.type[0].toUpperCase()}${this.type.slice(1, this.type.length - 1)}`;
      const name = resourceNameToString(this.resourceName);
      throw new Error(
        `${resourceType} '${name}' does not exist in the project`,
      );
    }
    return this.content as ResourceContent;
  }

  // Update resource; the base class makes some checks only.
  protected async update<Type>(
    key: string,
    _op: Operation<Type>,
  ): Promise<void> {
    const content = this.data;
    if (!content) {
      throw new Error(`Resource '${this.fileName}' does not exist`);
    }
    if (this.moduleResource) {
      throw new Error(`Cannot update module resources`);
    }
    if (key === '' || key === undefined) {
      throw new Error(`Cannot update empty key`);
    }
  }

  // Write the content from memory to disk.
  protected async write() {
    if (this.moduleResource) {
      throw new Error(`Cannot change module resources`);
    }

    // Create folder for resources and add correct .schema file.
    if (!pathExists(this.resourceFolder)) {
      await mkdir(this.resourceFolder);
      await writeJsonFile(
        join(this.resourceFolder, '.schema'),
        this.contentSchema,
        {
          flag: 'wx',
        },
      );
    }

    // Check if "name" has changed. Changing "name" means renaming the file.
    const nameInContent = resourceName(this.content.name).identifier + '.json';
    const currentFileName = basename(this.fileName);

    if (nameInContent !== currentFileName) {
      const newFileName = join(this.resourceFolder, nameInContent);
      await rename(this.fileName, newFileName);
      this.fileName = newFileName;
    }
    await writeJsonFile(this.fileName, this.content);
  }

  // Validate that current memory-based 'content' is valid.
  protected async validate(content?: object) {
    const invalidJson = Validate.getInstance().validateJson(
      content ? content : this.content,
      this.contentSchemaId,
    );
    if (invalidJson.length) {
      throw new Error(`Invalid content JSON: ${invalidJson}`);
    }
  }
}
