/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';

import { DefaultContent } from './create-defaults.js';
import { FolderResource } from './folder-resource.js';
import { resourceNameToString } from '../utils/resource-utils.js';
import { sortCards } from '../utils/card-utils.js';
import { writeJsonFileIfAbsent } from '../utils/json.js';
import { pathExists } from '../utils/file-utils.js';

import type { Card } from '../interfaces/project-interfaces.js';
import type { CardTree } from '../containers/project/card-tree.js';
import type { Project } from '../containers/project.js';
import type { ResourceName } from '../utils/resource-utils.js';
import type {
  TemplateConfiguration,
  TemplateMetadata,
} from '../interfaces/resource-interfaces.js';

/**
 * Template resource class.
 */
export class TemplateResource extends FolderResource<TemplateMetadata, never> {
  private cardsSchema = super.contentSchemaContent('cardBaseSchema');

  /**
   * Creates an instance of TemplateResource
   * @param project Project to use
   * @param name Resource name
   */
  constructor(project: Project, name: ResourceName) {
    super(project, name, 'templates');

    this.contentSchemaId = 'templateSchema';
    this.contentSchema = super.contentSchemaContent(this.contentSchemaId);
  }

  /**
   * The template's full resource name, e.g. 'decision/templates/decision'.
   */
  public get fullName(): string {
    return resourceNameToString(this.resourceName);
  }

  /**
   * The tree holding the template's cards.
   */
  public get cardTree(): CardTree {
    return this.project.templateTree(this.fullName, this.templateCardsFolder());
  }

  /**
   * Returns path to the 'templates/<name>' folder.
   */
  public templateFolder(): string {
    return this.internalFolder;
  }

  /**
   * Returns path to the 'templates/<name>/c' folder.
   */
  public templateCardsFolder(): string {
    return join(this.internalFolder, 'c');
  }

  /**
   * Whether the template's card folder exists on disk.
   */
  public isCreated(): boolean {
    return pathExists(this.templateCardsFolder());
  }

  /**
   * Sets new metadata into the template object.
   * @param newContent metadata content for the template.
   */
  public async create(newContent?: TemplateMetadata) {
    if (!newContent) {
      newContent = DefaultContent.template(this.fullName);
    } else {
      await this.validate(newContent);
    }

    return super.create(newContent);
  }

  /**
   * Deletes file and folder that this resource is based on.
   * Also drops the template's cards.
   */
  public async delete() {
    this.project.removeTemplateTree(this.fullName);
    return super.delete();
  }

  /**
   * Renames the template, and moves its card tree with it.
   * @param newIdentifier New identifier for the template.
   */
  public async rename(newIdentifier: string) {
    const oldName = this.fullName;
    await super.rename(newIdentifier);
    this.project.renameTemplateTree(
      oldName,
      this.fullName,
      this.templateCardsFolder(),
    );
  }

  /**
   * Shows metadata of the resource.
   * @returns template metadata.
   */
  public show(): TemplateConfiguration {
    const templateMetadata = super.show();

    return {
      name: this.fullName,
      category: templateMetadata.category,
      displayName: templateMetadata.displayName,
      description: templateMetadata.description,
      path: this.fileName,
      numberOfCards: this.cardTree.count,
    };
  }

  /**
   * List where template is used.
   * Always returns card key references first, then calculation references.
   *
   * @param cards Optional. Check these cards for usage of this resource. If undefined, will check all cards.
   * @returns array of card keys, and calculation filenames that refer this resource.
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
   * Create the template's cards folder.
   */
  public async write() {
    await super.write();

    // Create folder for cards and put proper content schema file there
    const schemaContentFile = join(this.templateCardsFolder(), '.schema');
    await mkdir(this.templateCardsFolder(), { recursive: true });
    await writeJsonFileIfAbsent(schemaContentFile, this.cardsSchema);
  }
}
