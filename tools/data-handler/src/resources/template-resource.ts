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

import { dirname, join } from 'node:path';
import { mkdir } from 'node:fs/promises';

import { DefaultContent } from './create-defaults.js';
import { FolderResource } from './folder-resource.js';
import { resourceNameToString } from '../utils/resource-utils.js';
import { sortCards } from '../utils/card-utils.js';
import { Template } from '../containers/template.js';
import { writeJsonFile } from '../utils/json.js';

import type { Card } from '../interfaces/project-interfaces.js';
import type { Operation } from './resource-object.js';
import type { Project } from '../containers/project.js';
import type { ResourceName } from '../utils/resource-utils.js';
import type {
  TemplateConfiguration,
  TemplateMetadata,
  UpdateKey,
} from '../interfaces/resource-interfaces.js';

/**
 * Template resource class.
 */
export class TemplateResource extends FolderResource<TemplateMetadata, never> {
  private cardContainer: Template;
  private cardsFolder = '';
  private cardsSchema = super.contentSchemaContent('cardBaseSchema');

  constructor(project: Project, name: ResourceName) {
    super(project, name, 'templates');

    this.contentSchemaId = 'templateSchema';
    this.contentSchema = super.contentSchemaContent(this.contentSchemaId);

    this.cardsFolder = join(this.internalFolder, 'c');

    // Each template resource contains a template card container (with template cards).
    // todo: Fix Template constructor not to use Resource, but just this filename with path
    this.cardContainer = new Template(this.project, {
      name: resourceNameToString(this.resourceName),
      path: dirname(this.fileName),
    });
  }

  /**
   * Handle name changes for templates
   * @param existingName The previous name before the change
   */
  protected async onNameChange(existingName: string): Promise<void> {
    await Promise.all([
      super.updateHandleBars(existingName, this.content.name),
      super.updateCalculations(existingName, this.content.name),
    ]);
    await this.write();
  }

  /**
   * Sets new metadata into the template object.
   * @param newContent metadata content for the template.
   * @throws if 'newContent' is not valid.
   */
  public async create(newContent?: TemplateMetadata) {
    if (!newContent) {
      newContent = DefaultContent.template(
        resourceNameToString(this.resourceName),
      );
    } else {
      await this.validate(newContent);
    }

    return super.create(newContent);
  }

  /**
   * Deletes file and folder that this resource is based on.
   * Also removes template cards from the project's card cache.
   */
  public async delete() {
    const templateName = resourceNameToString(this.resourceName);
    this.project.cardsCache.deleteCardsFromTemplate(templateName);
    return super.delete();
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
   * @returns template metadata.
   */
  public show(): TemplateConfiguration {
    const templateMetadata = super.show();
    const container = this.templateObject();

    return {
      name: resourceNameToString(this.resourceName),
      category: templateMetadata.category,
      displayName: templateMetadata.displayName,
      description: templateMetadata.description,
      path: this.fileName,
      numberOfCards: container.listCards().length,
    };
  }

  /**
   * Returns template card container object.
   * @returns template container object
   */
  public templateObject(): Template {
    return this.cardContainer;
  }

  /**
   * Updates template resource.
   * @param updateKey Key to modify
   * @param op Operation to perform on 'key'
   * @throws if key is unknown.
   */
  public async update<Type, K extends string>(
    updateKey: UpdateKey<K>,
    op: Operation<Type>,
  ) {
    if (updateKey.key === 'category') {
      const content = structuredClone(this.content);
      content.category = super.handleScalar(op) as string;

      await super.postUpdate(content, updateKey, op);
      return;
    }

    await super.update(updateKey, op);
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
    this.cardsFolder = join(this.internalFolder, 'c');

    // Create folder for cards and put proper content schema file there
    const schemaContentFile = join(this.cardsFolder, '.schema');
    await mkdir(this.cardsFolder, { recursive: true });
    await writeJsonFile(schemaContentFile, this.cardsSchema, {
      flag: 'wx',
    });
  }
}
