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
  GraphModel,
  GraphModelMetadata,
  GraphModelUpdateKey,
} from '../interfaces/resource-interfaces.js';
import type { GraphModelContent } from '../interfaces/folder-content-interfaces.js';
import { writeFileSafe } from '../utils/file-utils.js';

/**
 * Graph model resource class.
 */
export class GraphModelResource extends FolderResource {
  constructor(project: Project, name: ResourceName) {
    super(project, name, 'graphModels');

    this.contentSchemaId = 'graphModelSchema';
    this.contentSchema = super.contentSchemaContent(this.contentSchemaId);

    this.initialize();
  }

  /**
   * Handle name changes for graph models
   * @param existingName The previous name before the change
   */
  protected async onNameChange(existingName: string): Promise<void> {
    await Promise.all([
      super.updateHandleBars(existingName, this.content.name, [
        await this.calculationFile(),
      ]),
      super.updateCalculations(existingName, this.content.name),
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
    const calculationsFile = join(this.internalFolder, 'model.lp');
    await writeFileSafe(
      calculationsFile,
      `% add your calculations here for '${this.resourceName.identifier}'`,
      {
        flag: 'wx',
      },
    );
  }

  /**
   * Returns resource content.
   */
  public get data(): GraphModel {
    return super.data as GraphModel;
  }

  /**
   * Deletes file and folder that this resource is based on.
   */
  public async delete() {
    return super.delete();
  }

  /**
   * Returns calculation file that this graph model has.
   * @returns calculation file name that this graph model has.
   */
  public async calculationFile(nameOnly: boolean = false): Promise<string> {
    return (
      await readdir(this.internalFolder, {
        withFileTypes: true,
        recursive: true,
      })
    )
      .filter((dirent) => dirent.isFile() && extname(dirent.name) === '.lp')
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
   * Shows metadata of the resource.
   * @returns graph model metadata.
   */
  public async show(): Promise<GraphModel> {
    const baseData = (await super.show()) as GraphModelMetadata;
    return {
      ...baseData,
      content: (await super.contentData()) as GraphModelContent,
    };
  }

  /**
   * Updates graph model resource.
   * @param key Key to modify
   * @param op Operation to perform on 'key'
   */
  public async update<Type>(key: GraphModelUpdateKey, op: Operation<Type>) {
    if (key === 'category') {
      const content = structuredClone(this.content) as GraphModelMetadata;
      content.category = super.handleScalar(op) as string;

      await super.postUpdate(content, key, op);
      return;
    }

    await super.update(key, op);
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

  /**
   * Validates graphModel.
   * @throws when there are validation errors.
   * @param content Content to be validated.
   * @note If content is not provided, base class validation will use resource's current content.
   */
  public async validate(content?: object) {
    return super.validate(content);
  }

  /**
   *  Create the graph model's folder and calculation file.
   */
  public async write() {
    await super.write();
  }
}
