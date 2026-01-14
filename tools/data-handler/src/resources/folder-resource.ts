/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { basename, dirname, join, normalize } from 'node:path';
import { mkdir, readdir, readFile, rename, rm } from 'node:fs/promises';

import { isContentKey } from '../interfaces/resource-interfaces.js';
import {
  filename,
  contentPropertyName,
  ALL_FILE_MAPPINGS,
} from '../interfaces/folder-content-interfaces.js';
import { formatJson } from '../utils/json.js';
import { VALID_FOLDER_RESOURCE_FILES } from '../utils/constants.js';
import { writeFileSafe } from '../utils/file-utils.js';
import { ResourceObject } from './resource-object.js';
import { resourceName } from '../utils/resource-utils.js';

import type { UpdateKey } from '../interfaces/resource-interfaces.js';
import type { FolderResourceContent } from '../interfaces/folder-content-interfaces.js';
import type { Operation } from './resource-object.js';
import type { Project } from '../containers/project.js';
import type { ResourceFolderType } from '../interfaces/project-interfaces.js';
import type { ResourceBaseMetadata } from '../interfaces/resource-interfaces.js';
import type { ResourceName } from '../utils/resource-utils.js';
import type { ShowReturnType } from './resource-object.js';

/**
 * Folder type resource class.
 * These are resources that have their own folders for content.
 */
export abstract class FolderResource<
  T extends ResourceBaseMetadata,
  U extends FolderResourceContent,
> extends ResourceObject<T, U> {
  protected internalFolder: string = '';
  private resourceContent: U = {} as U;

  /**
   * Constructs a FolderResource object.
   * @param project Project in which this resource exists.
   * @param name Name for the resource.
   * @param type Type for this resource.
   */
  constructor(project: Project, name: ResourceName, type: ResourceFolderType) {
    super(project, name, type);
    this.initialize();
  }

  /**
   * Creates a new folder type object. Base class writes the object to disk automatically.
   * @param newContent Content for the type.
   */
  protected async create(newContent?: T) {
    // Validate resource identifier before creating on disk
    this.validateResourceIdentifier();
    await super.create(newContent);
    await mkdir(this.internalFolder, { recursive: true });
  }

  /**
   * Initialize the resource item.
   */
  protected initialize() {
    super.initialize();

    this.internalFolder = join(
      this.resourceFolder,
      this.resourceName.identifier,
    );
  }

  /**
   * For handling name changes.
   * @param previousName The previous name before the change
   */
  protected abstract onNameChange?(previousName: string): Promise<void>;

  /**
   * Set content files. Should not be called by others than resource cache.
   */
  public setContentFiles(contentFiles: Map<string, string>) {
    const content = {} as Record<string, unknown>;

    for (const [fileName, fileContent] of contentFiles.entries()) {
      const key = contentPropertyName(fileName);
      if (key) {
        const isJson = key === ALL_FILE_MAPPINGS['parameterSchema.json'];
        content[key] = isJson ? JSON.parse(fileContent) : fileContent;
      }
    }

    this.resourceContent = content as U;
  }

  /**
   * Load all content files from the internal folder and set them.
   */
  protected async loadContentFiles() {
    const contentFiles = new Map<string, string>();
    const files = await readdir(this.internalFolder, { withFileTypes: true });
    for (const file of files) {
      if (file.isFile() && VALID_FOLDER_RESOURCE_FILES.includes(file.name)) {
        const filePath = join(this.internalFolder, file.name);
        const content = await readFile(filePath, 'utf-8');
        contentFiles.set(file.name, content);
      }
    }
    this.setContentFiles(contentFiles);
  }

  /**
   * Updates a file in the resource.
   * @param fileName The name of the file to update.
   * @param changedContent The new content for the file.
   */
  public async updateFile(fileName: string, changedContent: string) {
    const filePath = join(this.internalFolder, fileName);

    // Do not allow updating file in other directories
    const normalizedFilePath = normalize(filePath);
    const normalizedInternalFilePath = normalize(this.internalFolder);
    if (dirname(normalizedFilePath) !== normalizedInternalFilePath) {
      throw new Error(`File '${fileName}' is not in the resource`);
    }

    // This makes sure that the file is in the resource folder.
    if (basename(normalizedFilePath) !== fileName) {
      throw new Error(`File '${fileName}' is not in the resource`);
    }
    // check if the file is allow-listed
    if (!VALID_FOLDER_RESOURCE_FILES.includes(fileName)) {
      throw new Error(`File '${fileName}' is not allowed to be updated`);
    }

    // TODO: Updates should either use valid strings or allow for objects
    const key = contentPropertyName(fileName);
    const isJson = key === ALL_FILE_MAPPINGS['parameterSchema.json'];
    let parsedContent: unknown = changedContent;
    if (isJson) {
      try {
        parsedContent = JSON.parse(changedContent);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Invalid JSON content for '${key}' update: ${message}`);
      }
    }
    const contentToWrite = isJson
      ? formatJson(parsedContent as object)
      : changedContent;

    await writeFileSafe(filePath, contentToWrite, { flag: 'w' });

    // Update this resource's content
    if (key) {
      (this.resourceContent as Record<string, unknown>)[key] = parsedContent;
    }
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
   * Gets content of all files to properties.
   * @returns object with property names as keys and file contents as values.
   */
  public contentData(): U {
    // TODO: Instead of casting, validate that content matches U
    // This requires a runtime schema for U to be defined(via an abstract variable)

    return this.resourceContent;
  }

  /**
   * Deletes file and content folder from disk and clears out the memory resident object.
   */
  public async delete() {
    await super.delete();
    await rm(this.internalFolder, { recursive: true, force: true });
  }

  /**
   * Shows metadata of the resource and content of the resource.
   * @template T Resource type
   * @template U Resource content
   * @returns resource type's metadata and content.
   */
  public show(): ShowReturnType<T, U> {
    this.assertResourceExists();
    return {
      ...this.content,
      content: this.contentData(),
    };
  }

  /**
   * Updates resource.
   * @param updateKey Key to modify
   * @param op Operation to perform on 'key'
   * @throws if key is unknown.
   */
  public async update<Type, K extends string>(
    updateKey: UpdateKey<K>,
    op: Operation<Type>,
  ) {
    const { key } = updateKey;
    if (isContentKey(updateKey)) {
      const fileName = filename(updateKey.subKey)!;
      const fileContent = super.handleScalar(op);
      const fileContentString =
        typeof fileContent === 'string'
          ? fileContent
          : formatJson(fileContent as object); // TODO: Fix operation types. In practice, content files are either strings or objects

      await this.updateFile(fileName, fileContentString);
      return;
    }

    const nameChange = key === 'name';
    const existingName = this.content.name;
    await super.update(updateKey, op);
    const content = structuredClone(this.content);

    if (key === 'name') {
      content.name = super.handleScalar(op) as string;
    } else if (key === 'displayName') {
      content.displayName = super.handleScalar(op) as string;
    } else if (key === 'description') {
      content.description = super.handleScalar(op) as string;
    } else {
      throw new Error(`Unknown property '${key}' for folder resource`);
    }

    await super.postUpdate(content, updateKey, op);

    if (nameChange) {
      await this.onNameChange?.(existingName);
    }
  }
}
