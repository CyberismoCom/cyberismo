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

import { extname, join } from 'node:path';
import { readdir } from 'node:fs/promises';

import { copyDir } from '../utils/file-utils.js';
import { DefaultContent } from './create-defaults.js';
import { FolderResource } from './folder-resource.js';
import { getStaticDirectoryPath } from '@cyberismo/assets';
import { resourceNameToString } from '../utils/resource-utils.js';
import { sortCards } from '../utils/card-utils.js';

import type { Card } from '../interfaces/project-interfaces.js';
import type { GraphViewContent } from '../interfaces/folder-content-interfaces.js';
import type { GraphViewMetadata } from '../interfaces/resource-interfaces.js';
import type { Project } from '../containers/project.js';
import type { ResourceName } from '../utils/resource-utils.js';
import type { UpdateKey } from '../interfaces/resource-interfaces.js';
import type { Operation } from './resource-object.js';

/**
 * Graph view resource class.
 */
export class GraphViewResource extends FolderResource<
  GraphViewMetadata,
  GraphViewContent
> {
  /**
   * Creates instance of GraphViewResource
   * @param project Project to use
   * @param name Resource name
   */
  constructor(project: Project, name: ResourceName) {
    super(project, name, 'graphViews');

    this.contentSchemaId = 'graphViewSchema';
    this.contentSchema = super.contentSchemaContent(this.contentSchemaId);
  }

  /**
   * Handle name changes for graph views
   * @param existingName The previous name before the change
   */
  protected async onNameChange(existingName: string): Promise<void> {
    await Promise.all([
      super.updateHandleBars(existingName, this.content.name, [
        await this.handleBarFile(),
      ]),
      super.updateCalculations(existingName, this.content.name),
      super.updateCardContentReferences(existingName, this.content.name),
    ]);
    await this.write();
  }

  /**
   * Sets new metadata into the graph view object.
   * @param newContent metadata content for the graph view.
   * @throws if 'newContent' is not valid.
   */
  public async create(newContent?: GraphViewMetadata) {
    if (!newContent) {
      newContent = DefaultContent.graphView(
        resourceNameToString(this.resourceName),
      );
    } else {
      await this.validate(newContent);
    }

    await super.create(newContent);
    await copyDir(
      join(await getStaticDirectoryPath(), 'defaultGraphView'),
      this.internalFolder,
    );

    await this.loadContentFiles();
  }

  /**
   * Returns handlebar filename that this graph view has.
   * @returns handlebar filename that this graph view has.
   */
  public async handleBarFile(nameOnly: boolean = false): Promise<string> {
    return (
      await readdir(this.internalFolder, {
        withFileTypes: true,
        recursive: true,
      })
    )
      .filter((dirent) => dirent.isFile() && extname(dirent.name) === '.hbs')
      .map((item) => (nameOnly ? item.name : join(item.parentPath, item.name)))
      .at(0)!;
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
    // TODO: Implement graph view-specific transient changes
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
