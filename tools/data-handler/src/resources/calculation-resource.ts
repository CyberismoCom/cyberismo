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

import {
  DefaultContent,
  FolderResource,
  resourceNameToString,
  sortCards,
} from './folder-resource.js';
import { writeFileSafe } from '../utils/file-utils.js';

import type {
  Calculation,
  CalculationMetadata,
  CalculationUpdateKey,
} from '../interfaces/resource-interfaces.js';
import type { CalculationContent } from '../interfaces/folder-content-interfaces.js';
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
  protected async onNameChange(existingName: string) {
    await super.updateCalculations(existingName, this.content.name);
    await this.write();
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
    return this.onNameChange(existingName);
  }

  /**
   * Shows metadata of the resource.
   * @returns calculation metadata.
   */
  public async show(): Promise<Calculation> {
    const baseData = (await super.show()) as CalculationMetadata;
    const fileContents = await super.contentData();
    const content: CalculationContent = {
      calculation: fileContents.calculation as string,
    };
    return {
      ...baseData,
      content: content,
    };
  }

  /**
   * Updates calculation resource.
   * @template Type The type of the operation being operated on for the given key.
   * @param key Key to modify
   * @param op Operation to perform on 'key'
   * @example
   * // Update the description
   *    await calculation.update('description', { name: 'change', to: 'New description' });
   *    await calculation.update({ key: 'content', subKey: 'calculation' }, { name: 'change', to: 'new content' });
   */
  public async update<Type>(key: CalculationUpdateKey, op: Operation<Type>) {
    if (
      typeof key === 'object' &&
      key.key === 'content' &&
      key.subKey === 'calculation'
    ) {
      const calculationContent = super.handleScalar(op) as string;
      await this.updateFile(this.calculationsFile, calculationContent);
      return;
    }
    await super.update(key, op);
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
