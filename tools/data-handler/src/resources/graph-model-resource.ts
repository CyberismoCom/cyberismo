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
import type { UpdateKey } from '../interfaces/resource-interfaces.js';
import type { Operation } from './resource-object.js';

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
   * Handle name changes for graph models
   * @param existingName The previous name before the change
   */
  protected async onNameChange(existingName: string): Promise<void> {
    await Promise.all([
      super.updateHandleBars(existingName, this.content.name, [
        join(this.internalFolder, CONTENT_FILES.model),
      ]),
      super.updateCalculations(existingName, this.content.name),
      super.updateCardContentReferences(existingName, this.content.name),
    ]);
    // Finally, write updated content.
    await this.write();
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
   * Apply transient changes for field type migrations.
   */
  public async migrate<Type, K extends string>(
    updateKey: UpdateKey<K>,
    op: Operation<Type>,
  ): Promise<void> {
    const { key } = updateKey;
    await super.migrate(updateKey, op);
    // TODO: move to base class
    if (key === 'name') {
      await this.onNameChange(this.content.name);
    }
    // TODO: Implement graph mpdel type-specific transient changes
  }

  /**
   * Renames the object and the file.
   * @param newName New name for the resource.
   */
  public async rename(newName: ResourceName) {
    const existingName = this.content.name;
    await super.rename(newName);
    return this.onNameChange(existingName);
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
