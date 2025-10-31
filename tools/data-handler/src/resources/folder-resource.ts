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
import { readdirSync, readFileSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm } from 'node:fs/promises';

import type {
  Card,
  ResourceFolderType,
} from '../interfaces/project-interfaces.js';
import type { ResourceBaseMetadata } from '../interfaces/resource-interfaces.js';
import {
  isContentKey,
  type UpdateKey,
} from '../interfaces/resource-interfaces.js';
import type { FolderResourceContent } from '../interfaces/folder-content-interfaces.js';
import {
  filename,
  propertyName,
} from '../interfaces/folder-content-interfaces.js';
import { formatJson, readJsonFile } from '../utils/json.js';
import { VALID_FOLDER_RESOURCE_FILES } from '../utils/constants.js';
import { writeFileSafe } from '../utils/file-utils.js';
import type { ShowReturnType } from './resource-object.js';
import { ResourceObject } from './resource-object.js';
import type { Operation } from './resource-object.js';
import { DefaultContent } from './create-defaults.js';
import { Project } from '../containers/project.js';
import {
  resourceName,
  resourceNameToString,
  type ResourceName,
} from '../utils/resource-utils.js';
import { sortCards } from '../utils/card-utils.js';

export {
  type Card,
  DefaultContent,
  type Operation,
  Project,
  type ResourceName,
  resourceNameToString,
  sortCards,
};

/**
 * Folder type resource class.
 * These are resources that have their own folders for content.
 */
export abstract class FolderResource<
  T extends ResourceBaseMetadata,
  U extends FolderResourceContent,
> extends ResourceObject<T, U> {
  protected internalFolder: string = '';

  // Cache for content files to avoid repeated filesystem operations. Content is stored as string.
  private contentFilesCache = new Map<string, string>();

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

  // Clears the content files cache.
  private clearContentCache() {
    this.contentFilesCache.clear();
  }

  // Preloads content files into cache.
  private preloadContentCache() {
    try {
      const files = readdirSync(this.internalFolder, { withFileTypes: true });
      for (const file of files) {
        if (file.isFile() && VALID_FOLDER_RESOURCE_FILES.includes(file.name)) {
          const filePath = join(this.internalFolder, file.name);
          try {
            const content = readFileSync(filePath, 'utf8');
            this.contentFilesCache.set(file.name, content);
          } catch {
            this.logger.warn({ file }, `Couldn't read a file`);
          }
        }
      }
    } catch {
      this.logger.warn(`Preloading cache failed from ${this.internalFolder}`);
    }
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

    // Populate content files to cache if resource exists in registry
    if (this.project.resourceExists(resourceNameToString(this.resourceName))) {
      this.preloadContentCache();
    }
  }

  /**
   * For handling name changes.
   * @param previousName The previous name before the change
   */
  protected abstract onNameChange?(previousName: string): Promise<void>;

  /**
   * Renames resource metadata file and renames memory resident object 'name'.
   * @param newName New name for the resource.
   */
  protected async rename(newName: ResourceName) {
    return super.rename(newName);
  }

  /**
   * Shows the content of a file in the resource.
   * @param fileName Name of the file to show.
   * @param json Content is JSON file.
   * @returns the content of the file.
   */
  protected async showFile(
    fileName: string,
    json: boolean = false,
  ): Promise<string> {
    // Always first check cache...
    if (this.contentFilesCache.has(fileName)) {
      const cached = this.contentFilesCache.get(fileName)!;
      return json ? JSON.parse(cached) : cached;
    }

    // ...cache miss, read from filesystem
    const filePath = join(this.internalFolder, fileName);
    const content = json
      ? await readJsonFile(filePath)
      : await readFile(filePath, 'utf8');

    // Update cache
    const contentStr =
      typeof content === 'string' ? content : formatJson(content);
    this.contentFilesCache.set(fileName, contentStr);

    return json ? content : contentStr;
  }

  /**
   * Shows all file names in the resource.
   * @returns all file names in the resource.
   */
  protected async showFileNames(): Promise<string[]> {
    // Always first check cache...
    if (this.contentFilesCache.size > 0) {
      return Array.from(this.contentFilesCache.keys());
    }

    // ...cache miss, read from filesystem and populate cache
    const files = await readdir(this.internalFolder);
    const validFiles = files.filter((file) =>
      VALID_FOLDER_RESOURCE_FILES.includes(file),
    );

    // Update cache by reading all files. Each method call updates specific cache item.
    for (const fileName of validFiles) {
      await this.showFile(fileName);
    }

    return validFiles;
  }

  /**
   * Updates a file in the resource.
   * @param fileName The name of the file to update.
   * @param changedContent The new content for the file.
   */
  protected async updateFile(fileName: string, changedContent: string) {
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

    await writeFileSafe(filePath, changedContent, { flag: 'w' });

    // Update cache with new content
    this.contentFilesCache.set(fileName, changedContent);
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
  public async contentData(): Promise<U> {
    const fileNames = await this.showFileNames();
    const content = {} as Record<string, unknown>;

    for (const fileName of fileNames) {
      const name = propertyName(fileName);
      if (name) {
        const JSONFile = name === 'schema';
        content[name] = await this.showFile(fileName, JSONFile);
      }
    }

    // TODO: Instead of casting, validate that content matches U
    // This requires a runtime schema for U to be defined(via an abstract variable)

    return content as U;
  }

  /**
   * Deletes file and content folder from disk and clears out the memory resident object.
   */
  public async delete() {
    await super.delete();
    await rm(this.internalFolder, { recursive: true, force: true });
    this.clearContentCache();
  }

  /**
   * Shows metadata of the resource and content of the resource.
   * @template T Resource type
   * @template U Resource content
   * @returns resource type's metadata and content.
   */
  public async show(): Promise<ShowReturnType<T, U>> {
    this.assertResourceExists();
    return {
      ...this.content,
      content: await this.contentData(),
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
