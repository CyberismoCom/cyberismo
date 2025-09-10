/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

import {
  DefaultContent,
  FolderResource,
  resourceNameToString,
  sortCards,
} from './folder-resource.js';
import { pathExists, writeFileSafe } from '../utils/file-utils.js';

import type { CalculationMetadata } from '../interfaces/resource-interfaces.js';
import type {
  Card,
  Operation,
  Project,
  ResourceName,
} from './file-resource.js';

/**
 * Calculation resource class.
 */
export class CalculationResource extends FolderResource {
  private calculationsFile = 'calculation.lp';
  constructor(project: Project, name: ResourceName) {
    super(project, name, 'calculations');

    this.contentSchemaId = 'calculationSchema';
    this.contentSchema = super.contentSchemaContent(this.contentSchemaId);

    this.initialize();
  }

  // When resource name changes
  private async handleNameChange(existingName: string) {
    await super.updateCalculations(existingName, this.content.name);
    await this.write();
  }

  /**
   * Returns calculation file name for this resource.
   * @returns calculation file name.
   */
  public async calculationFile(nameOnly: boolean = false): Promise<string> {
    const calculationsFileFullPath = join(
      this.internalFolder,
      this.calculationsFile,
    );

    const exists = pathExists(calculationsFileFullPath);
    if (exists) {
      return nameOnly ? this.calculationsFile : calculationsFileFullPath;
    }
    return '';
  }

  /**
   * Returns the content of the calculation file.
   * @returns the content of the calculation file as a string.
   */
  public async calculationContent(): Promise<string> {
    const calculationFilePath = await this.calculationFile();
    if (!calculationFilePath) {
      throw new Error(
        `No calculation file found for resource '${this.resourceName.identifier}'`,
      );
    }
    return readFile(calculationFilePath, 'utf-8');
  }

  /**
   * Creates a new calculation object and file.
   * @param newContent Content for the calculation.
   */
  public async create(newContent?: CalculationMetadata) {
    if (!newContent) {
      newContent = DefaultContent.calculation(
        resourceNameToString(this.resourceName),
      );
    } else {
      await this.validate(newContent);
    }
    await super.create(newContent);

    const calculationsFile = join(this.internalFolder, this.calculationsFile);
    await writeFileSafe(
      calculationsFile,
      `% add your calculations here for '${this.resourceName.identifier}'`,
      {
        flag: 'wx',
      },
    );
  }

  /**
   * Returns content data.
   */
  public get data(): CalculationMetadata {
    return super.data as CalculationMetadata;
  }

  /**
   * Deletes files from disk and clears out the memory resident object.
   */
  public async delete() {
    await super.delete();
  }

  /**
   * Renames resource metadata file and renames memory resident object 'name'.
   * @param newName New name for the resource.
   */
  public async rename(newName: ResourceName) {
    const existingName = this.content.name;
    await super.rename(newName);
    return this.handleNameChange(existingName);
  }

  /**
   * Shows metadata of the resource.
   * @returns calculation metadata.
   */
  public async show(): Promise<CalculationMetadata> {
    const showOnlyFileName = true;
    const metadata = (await super.show()) as CalculationMetadata;
    metadata.calculation = await this.calculationFile(showOnlyFileName);
    return metadata;
  }

  /**
   * Updates calculation resource.
   * @template Type The type of the operation being operated on for the given key.
   * @param key Key to modify
   * @param op Operation to perform on 'key'
   * @throws if 'key' is unknown, or if the operation cannot be performed on 'key'
   * @example
   * // Update the description
   * await calculation.update('description', { name: 'change', to: 'New description' });
   */
  public async update<Type>(key: string, op: Operation<Type>) {
    const nameChange = key === 'name';
    const existingName = this.content.name;

    await super.update(key, op);

    const content = this.content as CalculationMetadata;
    if (key === 'name') {
      content.name = super.handleScalar(op) as string;
    } else if (key === 'displayName') {
      content.displayName = super.handleScalar(op) as string;
    } else if (key === 'description') {
      content.description = super.handleScalar(op) as string;
    } else if (key === 'calculation') {
      content.calculation = super.handleScalar(op) as string;
      await super.updateFile(this.calculationsFile, content.calculation);
    } else {
      throw new Error(`Unknown property '${key}' for Calculation`);
    }

    await super.postUpdate(content, key, op);

    // Renaming this calculation causes that references to its name must be updated.
    if (nameChange) {
      await this.handleNameChange(existingName);
    }
  }

  /**
   * List where calculation resource is used in cards, or other calculation resources.
   * Always returns card key references first, then calculation references.
   *
   * @param cards Optional. Check these cards for usage of this resource. If undefined, will check all cards.
   * @returns array of card keys and calculation filenames that refer this resource.
   */
  public async usage(cards?: Card[]): Promise<string[]> {
    const allCards = cards || (await super.cards());

    const [cardContentReferences, calculations] = await Promise.all([
      super.usage(allCards),
      super.calculations(),
    ]);

    const cardReferences = cardContentReferences.sort(sortCards);
    return [...new Set([...cardReferences, ...calculations])];
  }

  /**
   * Validates the resource. If object is invalid, throws.
   * @param content Content to validate
   */
  public async validate(content?: object) {
    return super.validate(content);
  }
}
