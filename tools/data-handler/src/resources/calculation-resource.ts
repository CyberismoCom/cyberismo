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

import { readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import {
  DefaultContent,
  FileResource,
  resourceNameToString,
  sortCards,
} from './file-resource.js';
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
export class CalculationResource extends FileResource {
  private calculationFilePath: string = '';

  constructor(project: Project, name: ResourceName) {
    super(project, name, 'calculations');

    this.contentSchemaId = 'calculationSchema';
    this.contentSchema = super.contentSchemaContent(this.contentSchemaId);

    this.initialize();
  }

  // Reads the calculation content from the .lp file.
  private async readCalculationContent(): Promise<string> {
    if (!pathExists(this.calculationFilePath)) {
      throw new Error(
        `Calculation file '${this.calculationFilePath}' does not exist`,
      );
    }
    return readFile(this.calculationFilePath, 'utf-8');
  }

  // When resource name changes
  private async handleNameChange(existingName: string) {
    await Promise.all([
      super.updateHandleBars(existingName, this.content.name),
      super.updateCalculations(existingName, this.content.name),
    ]);
    await this.write();
  }

  // Override initialize to set up calculation file path
  protected initialize() {
    super.initialize();

    this.calculationFilePath = join(
      this.resourceFolder,
      this.resourceName.identifier + '.lp',
    );
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

    const calculationContent =
      newContent.calculation ||
      `% Calculation file: ${this.resourceName.identifier}\n% Add your logic programming rules here\n`;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { calculation: _calculation, ...metadataOnly } = newContent;

    await super.create(metadataOnly);
    await writeFileSafe(this.calculationFilePath, calculationContent, {
      flag: 'w',
    });
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
    if (pathExists(this.calculationFilePath)) {
      await unlink(this.calculationFilePath);
    }
    await super.delete();
  }

  /**
   * Renames resource metadata file and renames memory resident object 'name'.
   * @param newName New name for the resource.
   */
  public async rename(newName: ResourceName) {
    const existingName = this.content.name;

    if (pathExists(this.calculationFilePath)) {
      const newCalculationFilePath = join(
        this.resourceFolder,
        newName.identifier + '.lp',
      );
      await rename(this.calculationFilePath, newCalculationFilePath);
      this.calculationFilePath = newCalculationFilePath;
    }

    await super.rename(newName);
    return this.handleNameChange(existingName);
  }

  /**
   * Shows metadata of the resource.
   * @returns calculation metadata.
   */
  public async show(): Promise<CalculationMetadata> {
    const metadata = (await super.show()) as CalculationMetadata;
    metadata.calculation = await this.readCalculationContent();
    return metadata;
  }

  /**
   * Updates calculation resource.
   * @param key Key to modify
   * @param op Operation to perform on 'key'
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
      await writeFileSafe(this.calculationFilePath, content.calculation, {
        flag: 'w',
      });
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
   * Updates the calculation content in the .lp file.
   * @param calculationContent The new calculation content.
   */
  public async updateCalculationContent(calculationContent: string) {
    await writeFileSafe(this.calculationFilePath, calculationContent, {
      flag: 'w',
    });
    if (this.content && this.content.name) {
      const content = this.content as CalculationMetadata;
      content.calculation = calculationContent;
      await this.write();
    }
  }

  /**
   * List where calculation is used.
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
