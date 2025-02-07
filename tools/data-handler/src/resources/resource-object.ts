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
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { ArrayHandler } from './array-handler.js';
import { Project, ResourcesFrom } from '../containers/project.js';
import { ResourceContent } from '../interfaces/resource-interfaces.js';
import { ResourceFolderType } from '../interfaces/project-interfaces.js';
import { ResourceName } from '../utils/resource-utils.js';

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
};

// Move item in an array to new position.
export type RankOperation<T> = BaseOperation<T> & {
  name: 'rank';
  newIndex: number;
};

// Remove item from an array.
export type RemoveOperation<T> = BaseOperation<T> & {
  name: 'remove';
};

export type Operation<T> =
  | AddOperation<T>
  | ChangeOperation<T>
  | RankOperation<T>
  | RemoveOperation<T>;

/**
 * Abstract class for resources.
 */
export abstract class AbstractResource {
  protected abstract calculate(): Promise<void>; // update resource specific calculations
  protected abstract create(content?: ResourceContent): Promise<void>; // create a new with the content (memory)
  protected abstract delete(): Promise<void>; // delete from disk
  protected abstract read(): Promise<void>; // read content from disk (replaces existing content, if any)
  protected abstract rename(newName: ResourceName): Promise<void>; // change name of the resource and filename; same as update('name', ...)
  protected abstract show(): Promise<ResourceContent>; // return the content as JSON
  protected abstract update<Type>(
    key: string,
    operation: Operation<Type>,
  ): Promise<void>; // change one key of resource
  protected abstract validate(content?: object): Promise<void>; // validate the content
  protected abstract write(): Promise<void>; // write content to disk
}

/**
 * Base class for all resources.
 */
export class ResourceObject extends AbstractResource {
  protected moduleResource: boolean;
  protected contentSchema: JSON = {} as JSON;
  protected contentSchemaId: string = '';
  protected type: ResourceFolderType = '' as ResourceFolderType;
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
  protected async create(_content?: ResourceContent) {}
  protected async delete() {}
  protected async read() {}
  protected async rename(_name: ResourceName) {}
  protected async show(): Promise<ResourceContent> {
    return {} as ResourceContent;
  }
  protected async update<Type>(_key: string, _op: Operation<Type>) {}
  protected async validate(_content?: object) {}
  protected async write() {}

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
    return (operation as ChangeOperation<Type>).to;
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

        const filename = join(calculation.path, basename(calculation.name));
        try {
          const content = await readFile(filename, 'utf-8');
          const updatedContent = content.replaceAll(from, to);
          await writeFile(filename, updatedContent);
        } catch (error) {
          throw new Error(
            `Failed to process file ${filename}: ${(error as Error).message}`,
          );
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
}
