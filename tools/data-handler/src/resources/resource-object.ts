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
  ResourceFolderType,
} from '../interfaces/project-interfaces.js';
import type { Logger } from 'pino';
import type { Project } from '../containers/project.js';
import { ResourcesFrom } from '../containers/project/resource-cache.js';
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
  private static validateInstancePromise?: Promise<ValidateInstance>;

  protected content: T;
  protected moduleResource: boolean;
  protected contentSchema: JSON = {} as JSON;
  protected contentSchemaId: string = '';
  protected type: ResourceFolderType = '' as ResourceFolderType;
  protected resourceFolder: string = '';
  protected logger: Logger;

  /**
   * Path to the resource metadata file (the .json file).
   */
  public fileName: string = '';

  /**
   * Constructs a ResourceObject instance
   * @param project Project where this resource is
   * @param resourceName Name for the resource
   * @param type Type of resource
   */
  constructor(
    protected project: Project,
    protected resourceName: ResourceName,
    type: ResourceFolderType,
  ) {
    super();
    this.moduleResource =
      this.resourceName.prefix !== this.project.projectPrefix;
    this.type = type;
    this.logger = this.getLogger(this.getType);
    this.content = { name: '' } as T; // not found if name is empty
  }

  // Check if resource already exists. First checks the cache, then filesystem.
  private exists(): boolean {
    const name = resourceNameToString(this.resourceName);
    const existsInCache = this.project.resourceExists(name);
    return existsInCache || pathExists(this.fileName);
  }

  // Gets Validate command instance.
  private static async getValidate(): Promise<ValidateInstance> {
    // a bit hacky solution to avoid circular dependencies
    if (!this.validateInstancePromise) {
      this.validateInstancePromise = import('../commands/validate.js').then(
        ({ Validate }) => Validate.getInstance(),
      );
    }
    return this.validateInstancePromise;
  }

  // Type of resource.
  private resourceType(): ResourceFolderType {
    return this.type;
  }

  /**
   * Checks if resource exists
   * @throws if resource does not exist
   */
  protected assertResourceExists() {
    if (!this.exists()) {
      const resourceType = `${this.type[0].toUpperCase()}${this.type.slice(1, this.type.length - 1)}`;
      const name = resourceNameToString(this.resourceName);
      throw new Error(
        `${resourceType} '${name}' does not exist in the project`,
      );
    }
  }

  /**
   * Calculate; empty implementation.
   */
  protected async calculate() {}

  /**
   * Calculations that use this resource.
   * @throws if accessing calculations files failed
   */
  protected async calculations(): Promise<string[]> {
    const references: string[] = [];
    const resourceName = resourceNameToString(this.resourceName);
    for (const calculation of this.project.calculations(ResourcesFrom.all)) {
      // calculation.fileName points to the .json file, but we need the .lp file
      const calculationFolder = calculation.fileName.replace(/\.json$/, '');
      const filename = join(calculationFolder, 'calculation.lp');
      try {
        const content = await readFile(filename, 'utf-8');
        if (content.includes(resourceName)) {
          references.push(calculation.data!.name);
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

  /**
   * Cards from project.
   */
  protected cards(): Card[] {
    return [
      ...this.project.cards(undefined),
      ...this.project.allTemplateCards(),
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

  /**
   * Creates resource.
   * @param newContent Content for resource.
   * @throws when resource already exists in the project.
   */
  protected async create(newContent?: T) {
    this.validateResourceIdentifier();

    if (this.exists()) {
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
      this.fileName = join(
        this.resourceFolder,
        this.resourceName.identifier + '.json',
      );
    }

    const validator = await ResourceObject.getValidate();
    const validName = validator.validResourceName(
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

    const resourceString = resourceNameToString(this.resourceName);
    this.project.addResource(resourceString, this);
  }

  /**
   * Gets a logger instance.
   * @param loggerName
   * @returns logger instance
   */
  protected getLogger(loggerName: string): Logger {
    return getChildLogger({
      module: loggerName,
    });
  }

  /**
   * Returns type of this resource.
   */
  protected get getType(): string {
    return this.type;
  }

  /**
   * Handles operation to an array.
   * @param operation Operation to perform on array.
   * @param arrayName Name of the array, for error messages.
   * @param array Array to be updated.
   * @returns Changed array after the operation.
   * @throws when operation cannot be done.
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
   * @throws when operation cannot be done
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

  /**
   * Initialize the resource.
   */
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
    // Only load content from disk if resource exists in the cache registry
    if (this.project.resourceExists(resourceNameToString(this.resourceName))) {
      try {
        this.content = readJsonFileSync(this.fileName);
      } catch {
        this.logger.debug(
          `Initializing resource '${resourceNameToString(this.resourceName)}' failed: failed to read file '${this.fileName}'`,
        );
      }
    }
  }

  /**
   * Called after inherited class has finished 'update' operation.
   * @param content New content for resource
   * @param updateKey Which property to change
   * @param op What kind of operation is performed to updateKey
   * @throws if validation fails after the update
   */
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

  /**
   * Reads content from file to memory.
   */
  protected async read() {
    this.content = await readJsonFile(this.fileName);
  }

  /**
   * Renames resource.
   * @param newName New name for the resource.
   * @throws if trying to rename module resource, or
   *         if resource does not exist,
   *         if trying to rename so that type changes
   */
  protected async rename(newName: ResourceName) {
    if (this.moduleResource) {
      throw new Error(`Cannot rename module resources`);
    }
    if (!this.exists()) {
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
    validator.validResourceName(
      this.resourceType(),
      resourceNameToString(newName),
      await this.project.projectPrefixes(),
    );
    const newFilename = join(
      this.project.paths.resourcePath(newName.type as ResourceFolderType),
      newName.identifier + '.json',
    );

    const oldName = resourceNameToString(this.resourceName);
    await rename(this.fileName, newFilename);

    this.fileName = newFilename;
    this.content.name = resourceNameToString(newName);
    this.resourceName = newName;

    this.project.changeResourceName(oldName, this.content.name);
  }

  /**
   * Update resource; the base class makes some checks only.
   * @template type Resource type
   * @template K Resource key
   * @throws if resource does not exist, or
   *         if trying to update module content, or
   *         if key is empty
   */
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

  /**
   * Validates resource identifier to prevent filesystem operations with invalid names
   * todo: To Validate?
   */
  protected validateResourceIdentifier() {
    if (!this.moduleResource && this.resourceName.identifier) {
      const identifier = this.resourceName.identifier;
      if (!/^[a-zA-Z0-9._-]+$/.test(identifier)) {
        throw new Error(
          `Resource identifier must follow naming rules. Identifier '${identifier}' is invalid`,
        );
      }
    }
  }

  /**
   * Update calculation files.
   * @param from Resource name to update
   * @param to New name for resource
   * @throws if 'from' or 'to' is empty string, or
   *         if there was error accessing calculation files.
   */
  protected async updateCalculations(from: string, to: string) {
    if (!from.trim() || !to.trim()) {
      throw new Error(
        'updateCalculations: "from" and "to" parameters must not be empty',
      );
    }

    const calculations = this.project.calculations(ResourcesFrom.localOnly);

    await Promise.all(
      calculations.map(async (calculation) => {
        // todo: think better way to do this
        // calculation.fileName points to the .json file, but we need the .lp file
        const calculationFolder = calculation.fileName.replace(/\.json$/, '');
        const filename = join(calculationFolder, 'calculation.lp');

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
   * @throws if 'from' or 'to' is empty string
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

  /**
   * Check if there are references to the resource in the card content.
   * @note that this needs to be async, since inherited classes need to async operations
   * @param cards cards to check
   * @throws if resource does not exist
   */
  protected async usage(cards?: Card[]): Promise<string[]> {
    if (!this.exists()) {
      throw new Error(
        `Resource '${this.resourceName.identifier}' does not exist in the project`,
      );
    }
    const cardArray = cards?.length ? cards : this.project.cards(undefined);

    return cardArray
      .filter((card) =>
        card.content?.includes(resourceNameToString(this.resourceName)),
      )
      .map((card) => card.key);
  }

  /**
   * Checks if resource name is valid.
   * @param newName New name for resource.
   * @returns valid name
   */
  protected async validName(newName: ResourceName) {
    const validator = await ResourceObject.getValidate();
    const validName = validator.validResourceName(
      this.resourceType(),
      resourceNameToString(newName),
      await this.project.projectPrefixes(),
    );
    return validName;
  }

  /**
   * Write the content from memory to disk.
   * @throws if trying to write a module resource.
   */
  protected async write() {
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
    const resourceString = resourceNameToString(this.resourceName);

    if (nameInContent !== currentFileName) {
      const newFileName = join(this.resourceFolder, nameInContent);
      await rename(this.fileName, newFileName);
      this.fileName = newFileName;
      this.resourceName = resourceName(this.content.name);
      this.project.changeResourceName(resourceString, this.content.name);
    }
    await writeJsonFile(this.fileName, this.content);
  }

  /**
   * Returns memory resident data as JSON.
   * This is basically same as 'show' but doesn't do any checks; just returns the current content.
   * @returns metadata content or undefined if resource does not exist.
   */
  public get data() {
    return this.content.name !== '' ? this.content : undefined;
  }

  /**
   * Deletes the file and removes the resource from project.
   * @throws if resource is a module resource, or
   *         if resource does not exist, or
   *         if resource is used by other resources.
   */
  public async delete() {
    if (this.moduleResource) {
      throw new Error(
        `Cannot delete resource ${resourceNameToString(this.resourceName)}: It is a module resource`,
      );
    }
    if (!this.fileName.endsWith('.json')) {
      this.fileName += '.json';
    }
    if (!this.exists()) {
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
    this.project.removeResource(resourceNameToString(this.resourceName));
    this.fileName = '';
  }

  /**
   * Validates the content of the resource.
   * @param content Content to be validated.
   * @throws if content is invalid.
   */
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
