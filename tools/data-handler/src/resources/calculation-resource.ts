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

import { validateProgram } from '@cyberismo/node-clingo';

import { CONTENT_FILES } from '../interfaces/folder-content-interfaces.js';
import { DefaultContent } from '../resources/create-defaults.js';
import { FolderResource } from './folder-resource.js';
import { resourceNameToString } from '../utils/resource-utils.js';
import { sortCards } from '../utils/card-utils.js';
import { writeFileSafe } from '../utils/file-utils.js';

import type { ClingoValidationResult } from '@cyberismo/node-clingo';
import type { CalculationContent } from '../interfaces/folder-content-interfaces.js';
import type { CalculationMetadata } from '../interfaces/resource-interfaces.js';
import type { Card } from '../interfaces/project-interfaces.js';
import type { Project } from '../containers/project.js';
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
   * Validates a calculation logic program without solving it.
   * Catches syntax errors and safety errors (e.g. unsafe variables).
   * @param content Logic program to validate; defaults to this resource's
   *                current calculation content.
   * @returns validation result with clingo diagnostics.
   */
  public validateLogicProgram(content?: string): ClingoValidationResult {
    return validateProgram(content ?? this.contentData().calculation);
  }

  /**
   * Updates a file in the resource.
   * Rejects calculation content that is not a valid logic program.
   * @param fileName The name of the file to update.
   * @param changedContent The new content for the file.
   */
  public async updateFile(fileName: string, changedContent: string) {
    if (fileName === CONTENT_FILES.calculation) {
      const validation = this.validateLogicProgram(changedContent);
      if (!validation.valid) {
        throw new Error(
          `Invalid logic program for '${resourceNameToString(this.resourceName)}' update:\n${validation.errors.join('\n')}`,
        );
      }
    }
    return super.updateFile(fileName, changedContent);
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
