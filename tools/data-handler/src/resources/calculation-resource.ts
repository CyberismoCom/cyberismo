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

import { CONTENT_FILES } from '../interfaces/folder-content-interfaces.js';
import { DefaultContent } from '../resources/create-defaults.js';
import { FolderResource } from './folder-resource.js';
import { resourceNameToString } from '../utils/resource-utils.js';
import { sortCards } from '../utils/card-utils.js';
import { writeFileSafe } from '../utils/file-utils.js';

import type { CalculationContent } from '../interfaces/folder-content-interfaces.js';
import type {
  CalculationMetadata,
  UpdateKey,
} from '../interfaces/resource-interfaces.js';
import type { Card } from '../interfaces/project-interfaces.js';
import type { Project } from '../containers/project.js';
import type { Operation } from './resource-object.js';
import type { ResourceName } from '../utils/resource-utils.js';

/**
 * Calculation resource class.
 */
export class CalculationResource extends FolderResource<
  CalculationMetadata,
  CalculationContent
> {
  /**
   * Creates instance of CalculationResource
   * @param project Project to use
   * @param name Resource name
   */
  constructor(project: Project, name: ResourceName) {
    super(project, name, 'calculations');

    this.contentSchemaId = 'calculationSchema';
    this.contentSchema = super.contentSchemaContent(this.contentSchemaId);
  }

  /**
   * When resource name changes
   * @param existingName Current resource name
   */
  protected async onNameChange(existingName: string) {
    await Promise.all([
      super.updateCalculations(existingName, this.content.name),
      super.updateCardContentReferences(existingName, this.content.name),
    ]);
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

    const calculationContent = `% add your calculations here for '${this.resourceName.identifier}'`;
    const calculationFile = CONTENT_FILES.calculation;
    const calculationsFile = join(this.internalFolder, calculationFile);
    await writeFileSafe(calculationsFile, calculationContent, {
      flag: 'wx',
    });

    await this.loadContentFiles();
  }

  /**
   * Apply transient changes for calculation migrations.
   */
  public async migrate<Type, K extends string>(
    updateKey: UpdateKey<K>,
    op: Operation<Type>,
  ) {
    const { key } = updateKey;
    await super.migrate(updateKey, op);
    // TODO: move to base class
    if (key === 'name') {
      await this.onNameChange(this.content.name);
    }
    // TODO: Implement calculation-specific transient changes
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
    const allCards = cards || super.cards();

    const [cardContentReferences, calculations] = await Promise.all([
      super.usage(allCards),
      super.calculations(),
    ]);

    const cardReferences = cardContentReferences.sort(sortCards);
    return [...new Set([...cardReferences, ...calculations])];
  }
}
