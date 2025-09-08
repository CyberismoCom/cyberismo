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
  GraphView,
  GraphViewMetadata,
} from '../interfaces/resource-interfaces.js';

import { getStaticDirectoryPath } from '@cyberismo/assets';
import { copyDir } from '../utils/file-utils.js';

/**
 * Graph view resource class.
 */
export class GraphViewResource extends FolderResource {
  constructor(project: Project, name: ResourceName) {
    super(project, name, 'graphViews');

    this.contentSchemaId = 'graphViewSchema';
    this.contentSchema = super.contentSchemaContent(this.contentSchemaId);

    this.initialize();
  }

  // When resource name changes.
  private async handleNameChange(existingName: string) {
    await Promise.all([
      super.updateHandleBars(existingName, this.content.name, [
        await this.handleBarFile(),
      ]),
      super.updateCalculations(existingName, this.content.name),
    ]);
    // Finally, write updated content.
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
   * Returns resource content.
   */
  public get data(): GraphView {
    return super.data as GraphView;
  }

  /**
   * Deletes file and folder that this resource is based on.
   */
  public async delete() {
    return super.delete();
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
    return this.handleNameChange(existingName);
  }

  /**
   * Shows metadata of the resource.
   * @returns graph view metadata.
   */
  public async show(): Promise<GraphView> {
    const showOnlyFileName = true;
    const baseData = (await super.show()) as GraphViewMetadata;
    return {
      ...baseData,
      handleBarFile: await this.handleBarFile(showOnlyFileName),
    };
  }

  /**
   * Updates graph view resource.
   * @param key Key to modify
   * @param op Operation to perform on 'key'
   * @throws if key is unknown.
   */
  public async update<Type>(key: string, op: Operation<Type>) {
    const nameChange = key === 'name';
    const existingName = this.content.name;

    await super.update(key, op);

    const content = structuredClone(this.content) as GraphView;

    if (key === 'name') {
      content.name = super.handleScalar(op) as string;
    } else if (key === 'displayName') {
      content.displayName = super.handleScalar(op) as string;
    } else if (key === 'description') {
      content.description = super.handleScalar(op) as string;
    } else if (key === 'category') {
      content.category = super.handleScalar(op) as string;
    }

    await super.postUpdate(content, key, op);

    // Renaming this graph view causes that references to its name must be updated.
    if (nameChange) {
      await this.handleNameChange(existingName);
    }
  }

  /**
   * List where this resource is used.
   * Always returns card key references first, then calculation references.
   *
   * @param cards Optional. Check these cards for usage of this resource. If undefined, will check all cards.
   * @returns array of card keys and calculation filenames that refer this resource.
   */
  public async usage(cards?: Card[]): Promise<string[]> {
    const allCards = cards ?? (await super.cards());
    const [relevantCards, calculations] = await Promise.all([
      super.usage(allCards),
      super.calculations(),
    ]);
    return [...relevantCards.sort(sortCards), ...calculations];
  }

  /**
   * Validates graph view.
   * @throws when there are validation errors.
   * @param content Content to be validated.
   * @note If content is not provided, base class validation will use resource's current content.
   */
  public async validate(content?: object) {
    return super.validate(content);
  }

  /**
   *  Create the graph view's folder and handlebar file.
   */
  public async write() {
    await super.write();
  }
}
