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

import { readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

import type {
  Card,
  Operation,
  Project,
  ResourceName,
} from './folder-resource.js';
import {
  DefaultContent,
  FolderResource,
  resourceNameToString,
  sortCards,
} from './folder-resource.js';
import type {
  GraphViewMetadata,
  UpdateKey,
} from '../interfaces/resource-interfaces.js';
import type { GraphViewContent } from '../interfaces/folder-content-interfaces.js';

import { getStaticDirectoryPath } from '@cyberismo/assets';
import { copyDir } from '../utils/file-utils.js';

/**
 * Graph view resource class.
 */
export class GraphViewResource extends FolderResource<
  GraphViewMetadata,
  GraphViewContent
> {
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
   * Renames the object and the file.
   * @param newName New name for the resource.
   */
  public async rename(newName: ResourceName) {
    const existingName = this.content.name;
    await super.rename(newName);
    return this.onNameChange(existingName);
  }

  /**
   * Updates graph view resource.
   * @param updateKey Key to modify
   * @param op Operation to perform on 'key'
   */
  public async update<Type, K extends string>(
    updateKey: UpdateKey<K>,
    op: Operation<Type>,
  ) {
    if (updateKey.key === 'category') {
      const content = structuredClone(this.content) as GraphViewMetadata;
      content.category = super.handleScalar(op) as string;

      await super.postUpdate(content, updateKey, op);
      return;
    }

    await super.update(updateKey, op);
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
