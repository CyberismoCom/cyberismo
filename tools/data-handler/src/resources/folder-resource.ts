/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { basename, dirname, join, normalize } from 'node:path';
import { mkdir, readdir, readFile, rename, rm } from 'node:fs/promises';

import type { Schema } from 'jsonschema';

import { writeFileSafe } from '../utils/file-utils.js';
import { readJsonFile } from '../utils/json.js';

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
import { VALID_FOLDER_RESOURCE_FILES } from '../utils/constants.js';
import {
  propertyName,
  filename,
} from '../interfaces/folder-content-interfaces.js';

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
   * Extracts the filename from a content file path.
   * @param key The content file path (format: 'content/filename' or 'content/property').
   * @returns the actual filename part.
   */
  protected contentFileName(key: string): string {
    const nameOrFilename = key.split('/')[1];
    const actualFilename = filename(nameOrFilename);
    return actualFilename || nameOrFilename;
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

  // Get (resource folder) type name
  protected get getType() {
    return super.getType;
  }

  protected get logger() {
    return super.getLogger(this.getType);
  }

  protected initialize() {
    super.initialize();

    this.internalFolder = join(
      this.resourceFolder,
      this.resourceName.identifier,
    );
  }

  /**
   * Checks if a key represents a content file path (format: 'content/filename').
   * @param key The key to check.
   * @returns true if it's a content file path, false otherwise.
   */
  protected isContentFilePath(key: string): boolean {
    return key.startsWith('content/') && key.split('/').length === 2;
  }

  /**
   * Handles content updates for folder resources.
   * @param op Operation containing the content to update
   * @param contentTransformer Optional function to transform content before writing to files
   */
  protected async handleContentUpdate<Type>(
    op: Operation<Type>,
    contentTransformer?: (
      propertyName: string,
      content: string,
    ) => string | undefined,
  ): Promise<void> {
    const contentFiles = super.handleScalar(op) as Record<string, string>;
    const fileNameContent: Record<string, string> = {};

    for (const [propertyName, content] of Object.entries(contentFiles)) {
      const fileName = this.contentFileName(`content/${propertyName}`);
      if (fileName && content !== undefined) {
        let fileContent: string;
        if (contentTransformer) {
          const transformed = contentTransformer(propertyName, content);
          if (transformed === undefined) {
            continue; // Skip this property
          }
          fileContent = transformed;
        } else {
          fileContent =
            typeof content === 'string'
              ? content
              : JSON.stringify(content, null, 2);
        }
        fileNameContent[fileName] = fileContent;
      }
    }

    await this.updateContentFiles(fileNameContent);
  }

  /**
   * Handles individual content file updates (e.g., 'content/filename').
   * @param key The key being updated
   * @param op Operation containing the new content
   */
  protected async handleContentFileUpdate<Type>(
    key: string,
    op: Operation<Type>,
  ): Promise<void> {
    if (!this.isContentFilePath(key)) {
      return;
    }
    const fileName = this.contentFileName(key);
    const fileContent = super.handleScalar(op) as string;
    await this.updateFile(fileName, fileContent);
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
    return super.show();
  }

  /**
   * TODO: to be made protected - no direct access to files
   * Shows the content of a file in the resource.
   * @param fileName Name of the file to show.
   * @param json Content is JSON file.
   * @returns the content of the file.
   */
  public async showFile(
    fileName: string,
    json: boolean = false,
  ): Promise<string> {
    const filePath = join(this.internalFolder, fileName);
    return json ? readJsonFile(filePath) : readFile(filePath, 'utf8');
  }

  /**
   * TODO: to be made protected - no direct access to files
   * Shows all file names in the resource.
   * @returns all file names in the resource.
   */
  public async showFileNames(): Promise<string[]> {
    const files = await readdir(this.internalFolder);
    return files.filter((file) => VALID_FOLDER_RESOURCE_FILES.includes(file));
  }

  /**
   * Gets content of all files to properties.
   * @returns object with property names as keys and file contents as values.
   */
  public async contentData(): Promise<Record<string, string | Schema>> {
    const fileNames = await this.showFileNames();
    const content: Record<string, string | Schema> = {};

    for (const fileName of fileNames) {
      const name = propertyName(fileName);
      if (name) {
        const JSONFile = name === 'schema';
        content[name] = await this.showFile(fileName, JSONFile);
      }
    }

    return content;
  }

  /**
   * Updates content files from a content object.
   * @param contentFiles Object with file names as keys and file contents as values.
   */
  public async updateContentFiles(contentFiles: Record<string, string>) {
    for (const [fileName, fileContent] of Object.entries(contentFiles)) {
      await this.updateFile(fileName, fileContent);
    }
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
      throw new Error(`File '${fileName}' is not allowed`);
    }

    await writeFileSafe(filePath, changedContent, { flag: 'w' });
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
