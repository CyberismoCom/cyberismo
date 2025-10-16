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
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, join, sep } from 'node:path';

import { hasCode } from '../utils/error-utils.js';

import { ArrayHandler } from './array-handler.js';
import type {
  Card,
  Resource,
  ResourceFolderType,
} from '../interfaces/project-interfaces.js';
import type { Logger } from 'pino';
import type { Project } from '../containers/project.js';
import { ResourcesFrom } from '../containers/project/resource-collector.js';
import type {
  ResourceBaseMetadata,
  UpdateKey,
} from '../interfaces/resource-interfaces.js';
import type { Validate } from '../commands/validate.js';
import {
  resourceName,
  resourceNameToPath,
  resourceNameToString,
  type ResourceName,
} from '../utils/resource-utils.js';
import { getChildLogger } from '../utils/log-utils.js';
import { deleteFile, pathExists } from '../utils/file-utils.js';
import {
  readJsonFile,
  readJsonFileSync,
  writeJsonFile,
} from '../utils/json.js';

// Possible operations to perform when doing "update"
export type UpdateOperations = 'add' | 'change' | 'rank' | 'remove';
//| 'elementTypeChange';

// Base class for update operations.
type BaseOperation<T> = {
  name: 'add' | 'change' | 'rank' | 'remove';
  target: T;
};

// Add item to an array.
export type AddOperation<T> = BaseOperation<T> & {
  name: 'add';
};

// Change item in an array or property in an object or rename a scalar.
export type ChangeOperation<T> = BaseOperation<T> & {
  name: 'change';
  to: T;
  mappingTable?: { stateMapping: Record<string, string> }; // Optional state mapping for workflow changes
};

// Move item in an array to new position.
export type RankOperation<T> = BaseOperation<T> & {
  name: 'rank';
  newIndex: number;
};

// Remove item from an array.
export type RemoveOperation<T> = BaseOperation<T> & {
  name: 'remove';
  replacementValue?: T;
};

export type Operation<T> =
  | AddOperation<T>
  | ChangeOperation<T>
  | RankOperation<T>
  | RemoveOperation<T>;

// Utility mapping from operation name to its concrete operation type
export type OperationMap<T> = {
  add: AddOperation<T>;
  change: ChangeOperation<T>;
  rank: RankOperation<T>;
  remove: RemoveOperation<T>;
};

// Given an operation name, get the corresponding operation type
export type OperationFor<T, N extends UpdateOperations> = OperationMap<T>[N];

// T, but U is in the content field
export type ShowReturnType<T extends ResourceBaseMetadata, U = never> = Omit<
  T,
  'content'
> & {
  [K in 'content' as [U] extends [never] ? never : K]: U;
};

/**
 * Abstract class for resources.
 */
export abstract class AbstractResource<
  T extends ResourceBaseMetadata,
  U = never, // determines type returned by show()
> {
  protected abstract calculate(): Promise<void>; // update resource specific calculations
  protected abstract create(content?: T): Promise<void>; // create a new with the content (memory)
  protected abstract delete(): Promise<void>; // delete from disk
  protected abstract read(): Promise<void>; // read content from disk (replaces existing content, if any)
  protected abstract rename(newName: ResourceName): Promise<void>; // change name of the resource and filename; same as update('name', ...)
  protected abstract show(): Promise<ShowReturnType<T, U>>; // return the content as JSON
  protected abstract update<Type, K extends string>(
    updateKey: UpdateKey<K>,
    operation: Operation<Type>,
  ): Promise<void>; // change one key of resource
  protected abstract usage(cards?: Card[]): Promise<string[]>; // list of card keys or resource names where this resource is used in
  protected abstract validate(content?: object): Promise<void>; // validate the content
  protected abstract write(): Promise<void>; // write content to disk
  // Abstract getters
  protected abstract get getType(): string;
  protected abstract getLogger(loggerName: string): Logger;
}

type ValidateInstance = InstanceType<typeof Validate>;

export abstract class ResourceObject<
  T extends ResourceBaseMetadata,
  U,
> extends AbstractResource<T, U> {
  // TODO: Remove when INTDEV-1048 is implemented, since caching is done at object level
  private cache: Map<string, JSON>;
  private static validateInstancePromise?: Promise<ValidateInstance>;

  protected content: T;
  protected moduleResource: boolean;
  protected contentSchema: JSON = {} as JSON;
  protected contentSchemaId: string = '';
  protected type: ResourceFolderType = '' as ResourceFolderType;
  protected resourceFolder: string = '';
  protected logger: Logger;

  public fileName: string = '';

  constructor(
    protected project: Project,
    protected resourceName: ResourceName,
    type: ResourceFolderType,
  ) {
    super();
    this.moduleResource =
      this.resourceName.prefix !== this.project.projectPrefix;
    this.cache = this.project.resourceCache;
    this.type = type;
    this.logger = this.getLogger(this.getType);
    this.content = { name: '' } as T; // not found if name is empty
  }

  private static async getValidate(): Promise<ValidateInstance> {
    // a bit hacky solution to avoid circular dependencies
    if (!this.validateInstancePromise) {
      this.validateInstancePromise = import('../commands/validate.js').then(
        ({ Validate }) => Validate.getInstance(),
      );
    }
    return this.validateInstancePromise;
  }

  private resourceObjectToResource(): Resource {
    return {
      name: this.data ? this.data.name : '',
      path: this.fileName.substring(0, this.fileName.lastIndexOf(sep)),
    };
  }

  // Type of resource.
  private resourceType(): ResourceFolderType {
    return this.type;
  }

  private toCache() {
    this.cache.set(
      resourceNameToString(this.resourceName),
      this.content as unknown as JSON,
    );
  }

  /**
   * Checks if resource exists
   * @throws if resource does not exist
   */
  protected assertResourceExists() {
    if (!pathExists(this.fileName)) {
      const resourceType = `${this.type[0].toUpperCase()}${this.type.slice(1, this.type.length - 1)}`;
      const name = resourceNameToString(this.resourceName);
      throw new Error(
        `${resourceType} '${name}' does not exist in the project`,
      );
    }
  }

  protected async calculate() {}

  // Calculations that use this resource.
  protected async calculations(): Promise<string[]> {
    const references: string[] = [];
    const resourceName = resourceNameToString(this.resourceName);
    for (const calculation of await this.project.calculations(
      ResourcesFrom.all,
    )) {
      const fileNameWithExtension = calculation.name.endsWith('.lp')
        ? calculation.name
        : calculation.name + '.lp';
      const filename = join(calculation.path, basename(fileNameWithExtension));
      try {
        const content = await readFile(filename, 'utf-8');
        if (content.includes(resourceName)) {
          references.push(calculation.name);
        }
      } catch (error) {
        // Skip files that don't exist (they may have been renamed or deleted)
        if (hasCode(error) && error.code === 'ENOENT') {
          this.logger.warn(`Skipping non-existent file: ${filename}`);
          continue;
        }
        throw new Error(
          `Failed to process file ${filename}: ${(error as Error).message}`,
        );
      }
    }
    return references;
  }

  // Cards from project.
  protected async cards(): Promise<Card[]> {
    return [
      ...(await this.project.cards(undefined, {
        content: true,
        metadata: true,
      })),
      ...(await this.project.allTemplateCards({
        content: true,
        metadata: true,
      })),
    ];
  }

  /**
   * Returns .schema content file.
   * @param schemaId schema id
   * @returns .schema content.
   */
  protected contentSchemaContent(schemaId: string): JSON {
    return [
      {
        id: schemaId,
        version: 1,
      },
    ] as unknown as JSON;
  }

  // Creates resource.
  protected async create(newContent?: T) {
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

    const validator = await ResourceObject.getValidate();
    const validName = await validator.validResourceName(
      this.resourceType(),
      resourceNameToString(this.resourceName),
      await this.project.projectPrefixes(),
    );

    let validContent = {} as T;
    if (newContent) {
      validContent = newContent;
      validContent.name = validName;
    } else {
      validContent.description = '';
      validContent.displayName = '';
    }

    this.content = validContent;
    await this.write();

    // Notify project & collector
    this.project.addResource(
      this.resourceObjectToResource(),
      this.content as unknown as JSON,
    );
  }

  protected getLogger(loggerName: string): Logger {
    return getChildLogger({
      module: loggerName,
    });
  }

  protected get getType(): string {
    return this.type;
  }

  /**
   * Handles operation to an array.
   * @param operation Operation to perform on array.
   * @param arrayName Name of the array, for error messages.
   * @param array Array to be updated.
   * @returns Changed array after the operation.
   */
  protected handleArray<Type>(
    operation: Operation<Type>,
    arrayName: string,
    array: Type[],
  ): Type[] {
    const handler = new ArrayHandler<Type>();
    let result: Type[] = [];
    try {
      result = handler.handleArray(operation, array);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(
          `Cannot perform operation on '${arrayName}'. ${error.message}`,
        );
      }
    }
    return result;
  }

  /**
   * Updates scalar value. The only accepted operation is 'change'
   * @param operation Operation to perform on scalar.
   * @returns What the scalar should be changed to.
   */
  protected handleScalar<Type>(operation: Operation<Type>): Type {
    if (
      operation.name === 'add' ||
      operation.name === 'rank' ||
      operation.name === 'remove'
    ) {
      throw new Error(`Cannot do operation ${operation.name} on scalar value`);
    }
    return operation.to;
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
      this.moduleResource =
        this.resourceName.prefix !== this.project.projectPrefix;
      this.resourceFolder = this.moduleResource
        ? join(
            this.project.paths.modulesFolder,
            this.resourceName.prefix,
            this.resourceName.type,
          )
        : this.project.paths.resourcePath(this.type);
      this.fileName = resourceNameToPath(this.project, this.resourceName);
    }
    // Read from cache, if entry exists...
    if (this.cache.has(resourceNameToString(this.resourceName))) {
      this.content = this.cache.get(
        resourceNameToString(this.resourceName),
      ) as unknown as T;
      return;
    }
    //... otherwise read from disk and add to cache
    try {
      this.content = readJsonFileSync(this.fileName);
      this.toCache();
    } catch {
      // do nothing, it is possible that file has not been created yet.
    }
  }

  // Called after inherited class has finished 'update' operation.
  protected async postUpdate<Type, K extends string>(
    content: T,
    updateKey: UpdateKey<K>,
    op: Operation<Type>,
  ) {
    function toValue(op: Operation<Type>) {
      if (op.name === 'rank') return op.newIndex;
      if (op.name === 'add') return JSON.stringify(op.target);
      if (op.name === 'remove') return JSON.stringify(op.target);
      if (op.name === 'change') return JSON.stringify(op.to);
    }

    // Check that new name is valid.
    if (op.name === 'change' && updateKey.key === 'name') {
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
        throw new Error(
          `Cannot ${op.name} '${updateKey.key}' --> '${errorValue}: ${error.message}'`,
        );
      }
    }

    this.content = content;
    await this.write();
  }

  // Update resource; the base class makes some checks only.
  protected async update<Type, K extends string>(
    key: UpdateKey<K>,

    _op: Operation<Type>,
  ): Promise<void> {
    const content = this.data;
    if (!content) {
      throw new Error(
        `Resource '${resourceNameToString(this.resourceName)}' does not exist`,
      );
    }
    if (this.moduleResource) {
      throw new Error(`Cannot update module resources`);
    }
    if (key.key === '' || key === undefined) {
      throw new Error(`Cannot update empty key`);
    }
  }

  // Reads content from file to memory.
  protected async read() {
    this.content = await readJsonFile(this.fileName);
  }

  // Renames resource.
  protected async rename(newName: ResourceName) {
    this.cache.delete(resourceNameToString(this.resourceName));
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
    const validator = await ResourceObject.getValidate();
    await validator.validResourceName(
      this.resourceType(),
      resourceNameToString(newName),
      await this.project.projectPrefixes(),
    );
    const newFilename = join(
      this.project.paths.resourcePath(newName.type as ResourceFolderType),
      newName.identifier + '.json',
    );
    await rename(this.fileName, newFilename);

    this.fileName = newFilename;
    this.content.name = resourceNameToString(newName);
    this.resourceName = newName;
    this.toCache();
  }

  /**
   * Update calculation files.
   * @param from Resource name to update
   * @param to New name for resource
   */
  protected async updateCalculations(from: string, to: string) {
    if (!from.trim() || !to.trim()) {
      throw new Error(
        'updateCalculations: "from" and "to" parameters must not be empty',
      );
    }

    const calculations = await this.project.calculations(
      ResourcesFrom.localOnly,
    );

    await Promise.all(
      calculations.map(async (calculation) => {
        if (!calculation.path) {
          throw new Error(
            `Calculation file's '${calculation.name}' path is not defined`,
          );
        }

        const base = basename(calculation.name);
        const fileNameWithExtension = base.endsWith('.lp')
          ? base
          : base + '.lp';
        const filename = join(calculation.path, fileNameWithExtension);

        try {
          const content = await readFile(filename, 'utf-8');
          const updatedContent = content.replaceAll(from, to);
          await writeFile(filename, updatedContent);
        } catch (error) {
          if (hasCode(error) && error.code === 'ENOENT') {
            // Skip files that don't exist (they may have been renamed or deleted)
            this.getLogger(this.getType).warn(
              `Skipping non-existent file: ${filename}`,
            );
            return;
          }
          if (error instanceof Error) {
            throw new Error(
              `Failed to process file while updating calculation ${filename}: ${error.message}`,
            );
          }
        }
      }),
    );
  }

  /**
   * Update references in handlebars.
   * @param from Resource name to update
   * @param to New name for resource
   * @param handleBarFiles Optional. List of handlebar files. If omitted, affects all handlebar files in the project.
   */
  protected async updateHandleBars(
    from: string,
    to: string,
    handleBarFiles?: string[],
  ) {
    if (!from.trim() || !to.trim()) {
      throw new Error(
        'updateHandleBars: "from" and "to" parameters must not be empty',
      );
    }

    if (!handleBarFiles) {
      handleBarFiles = await this.project.reportHandlerBarFiles(
        ResourcesFrom.localOnly,
      );
    }

    // Process all files in parallel.
    await Promise.all(
      handleBarFiles.map(async (handleBarFile) => {
        const content = await readFile(handleBarFile);
        const updatedContent = content.toString().replaceAll(from, to);
        await writeFile(handleBarFile, Buffer.from(updatedContent));
      }),
    );
  }

  // Check if there are references to the resource in the card content.
  protected async usage(cards?: Card[]): Promise<string[]> {
    if (!pathExists(this.fileName)) {
      throw new Error(
        `Resource '${this.resourceName.identifier}' does not exist in the project`,
      );
    }
    const cardArray = cards?.length
      ? cards
      : await this.project.cards(undefined, {
          content: true,
          metadata: true,
        });

    return cardArray
      .filter((card) =>
        card.content?.includes(resourceNameToString(this.resourceName)),
      )
      .map((card) => card.key);
  }

  protected async validName(newName: ResourceName) {
    const validator = await ResourceObject.getValidate();
    const validName = await validator.validResourceName(
      this.resourceType(),
      resourceNameToString(newName),
      await this.project.projectPrefixes(),
    );
    return validName;
  }

  // Write the content from memory to disk.
  protected async write() {
    //stackoverflow.com/tags
    if (this.moduleResource) {
      throw new Error(`Cannot change module resources`);
    }

    // Create folder for resources and add correct .schema file.
    await mkdir(this.resourceFolder, { recursive: true });
    await writeJsonFile(
      join(this.resourceFolder, '.schema'),
      this.contentSchema,
      {
        flag: 'wx',
      },
    );
    // Check if "name" has changed. Changing "name" means renaming the file.
    const nameInContent = resourceName(this.content.name).identifier + '.json';
    const currentFileName = basename(this.fileName);

    if (nameInContent !== currentFileName) {
      const newFileName = join(this.resourceFolder, nameInContent);
      await rename(this.fileName, newFileName);
      this.fileName = newFileName;
    }

    await writeJsonFile(this.fileName, this.content);
    this.toCache();
  }

  // Returns memory resident data as JSON.
  // This is basically same as 'show' but doesn't do any checks; just returns the current content.
  public get data() {
    return this.content.name !== '' ? this.content : undefined;
  }

  public async delete() {
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
    const usedIn = await this.usage();
    if (usedIn.length > 0) {
      throw new Error(
        `Cannot delete resource ${resourceNameToString(this.resourceName)}. It is used by: ${usedIn.join(', ')}`,
      );
    }
    await deleteFile(this.fileName);
    this.project.removeResource(this.resourceObjectToResource());
    this.fileName = '';
  }

  // Validate that current memory-based 'content' is valid.
  public async validate(content?: object) {
    const validator = await ResourceObject.getValidate();
    const invalidJson = validator.validateJson(
      content ? content : this.content,
      this.contentSchemaId,
    );
    if (invalidJson.length) {
      throw new Error(`Invalid content JSON: ${invalidJson}`);
    }
  }
}
