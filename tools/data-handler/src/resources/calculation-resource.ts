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

import { type CalculationMetadata } from '../interfaces/resource-interfaces.js';
import type { CalculationContent } from '../interfaces/folder-content-interfaces.js';
import type { Card, Project, ResourceName } from './file-resource.js';

/**
 * Calculation resource class.
 */
export class CalculationResource extends FolderResource<
  CalculationMetadata,
  CalculationContent
> {
  private calculationsFile = 'calculation.lp';
  constructor(project: Project, name: ResourceName) {
    super(project, name, 'calculations');

    this.contentSchemaId = 'calculationSchema';
    this.contentSchema = super.contentSchemaContent(this.contentSchemaId);
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
   * Renames resource metadata file and renames memory resident object 'name'.
   * @param newName New name for the resource.
   */
  public async rename(newName: ResourceName) {
    const existingName = this.content.name;
    await super.rename(newName);
    return this.onNameChange(existingName);
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
}
