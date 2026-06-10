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

import { DefaultContent } from './create-defaults.js';
import { FolderResource } from './folder-resource.js';
import { resourceNameToString } from '../utils/resource-utils.js';
import { sortCards } from '../utils/card-utils.js';
import { writeFileSafe } from '../utils/file-utils.js';
import { CONTENT_FILES } from '../interfaces/folder-content-interfaces.js';

import type { Card } from '../interfaces/project-interfaces.js';
import type { GraphModelMetadata } from '../interfaces/resource-interfaces.js';
import type { GraphModelContent } from '../interfaces/folder-content-interfaces.js';
import type { Project } from '../containers/project.js';
import type { ResourceName } from '../utils/resource-utils.js';

/**
 * Graph model resource class.
 */
export class GraphModelResource extends FolderResource<
  GraphModelMetadata,
  GraphModelContent
> {
  /**
   * Creates an instance of GraphModelResource
   * @param project Project to use
   * @param name Resource name
   */
  constructor(project: Project, name: ResourceName) {
    super(project, name, 'graphModels');

    this.contentSchemaId = 'graphModelSchema';
    this.contentSchema = super.contentSchemaContent(this.contentSchemaId);
  }

  /**
   * Sets new metadata into the graph model object graph model.
   * @param newContent metadata content for the graph model.
   * @throws if 'newContent' is not valid.
   */
  public async create(newContent?: GraphModelMetadata) {
    if (!newContent) {
      newContent = DefaultContent.graphModel(
        resourceNameToString(this.resourceName),
      );
    } else {
      await this.validate(newContent);
    }

    await super.create(newContent);

    // Create the internal folder in 'create', instead of 'write'.
    const modelContent = `% add your calculations here for '${this.resourceName.identifier}'`;
    const modelFile = CONTENT_FILES.model;
    const calculationsFile = join(this.internalFolder, modelFile);
    await writeFileSafe(calculationsFile, modelContent, {
      flag: 'wx',
    });

    await this.loadContentFiles();
  }

  /**
   * List where this resource is used.
   * Always returns card key references first, then calculation references.
   *
   * @param cards Optional. Check these cards for usage of this resource. If undefined, will check all cards.
   * @returns array of card keys and calculation filenames that refer this resource.
   */
  public async usage(cards?: Card[]): Promise<string[]> {
    const allCards = cards ?? super.cards();
    const [relevantCards, calculations] = await Promise.all([
      super.usage(allCards),
      super.calculations(),
    ]);
    return [...relevantCards.sort(sortCards), ...calculations];
  }
}
