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
import {
  DataType,
  ResourceContent,
} from '../interfaces/resource-interfaces.js';
import { Project, ResourcesFrom } from '../containers/project.js';
import { ResourceFolderType } from '../interfaces/project-interfaces.js';
import { ResourceName } from '../utils/resource-utils.js';
import { updateArray } from '../utils/common-utils.js';

// Possible operations to perform when doing "update"
export type UpdateOperations = 'add' | 'change' | 'rank' | 'remove';
//| 'elementTypeChange';

type BaseOperation = {
  name: 'add' | 'change' | 'rank' | 'remove';
};

export type AddOperation<T> = BaseOperation & {
  name: 'add';
  item: T;
};

export type RenameOperation<T> = BaseOperation & {
  name: 'change';
  from: T;
  to: T;
};

export type RankOperation<T> = BaseOperation & {
  name: 'rank';
  item: T;
  newIndex: number;
};

export type RemoveOperation<T> = BaseOperation & {
  name: 'remove';
  item: T;
};

export type Operation<T> =
  | AddOperation<T>
  | RenameOperation<T>
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
  protected type: string = '';
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
   * Updates scalar value. The only accepted operation is 'change'
   * @param operation Operation to perform on scalar.
   * @returns What the scalar should be changed to.
   */
  protected handleScalar<Type>(operation: Operation<Type>): Type {
    const actualOp = operation as RenameOperation<Type>;
    if (
      operation.name === 'add' ||
      operation.name === 'rank' ||
      operation.name === 'remove'
    ) {
      throw new Error(
        `Cannot do operation ${operation.name} on scalar value ${actualOp.from}`,
      );
    }
    return actualOp.to;
  }

  /**
   * Handles operation to an array.
   * @param operation Operation to perform on array.
   * @param arrayName Name of the array, for error messages.
   * @param array
   * @returns What the array should be changed to.
   */
  protected handleArray<Type>(
    operation: Operation<Type>,
    arrayName: string,
    array: Type[],
  ): Type[] {
    const handler = new ArrayHandler<Type>();
    return handler.handleArray(operation, arrayName, array);
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
   *Update references in handlebars
   * @param from Resource name to update
   * @param to New name for resource
   * @todo: this is 95% same as in 'rename.ts'. Combine and share?
   */
  protected async updateHandleBars(from: string, to: string) {
    if (!from.trim() || !to.trim()) {
      throw new Error(
        'updateHandleBars: "from" and "to" parameters must not be empty',
      );
    }

    const handleBarFiles = await this.project.reportHandlerBarFiles(
      ResourcesFrom.localOnly,
    );

    // Create a safe regex by escaping special characters
    const escapedFrom = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const fromRe = new RegExp(escapedFrom, 'g');

    // Process all files in parallel with proper error handling
    await Promise.all(
      handleBarFiles.map(async (handleBarFile) => {
        const content = await readFile(handleBarFile);
        const updatedContent = content.toString().replace(fromRe, to);
        await writeFile(handleBarFile, Buffer.from(updatedContent));
      }),
    );
  }

  /**
   * Converts plural type name to singular
   * @type Type name to change.
   * @returns singular format of type name
   * @todo - this could be in some util class?
   */
  public singularType(type: string): ResourceFolderType {
    // note that this only works with certain nouns
    return type.substring(0, type.length - 1) as ResourceFolderType;
  }
}
