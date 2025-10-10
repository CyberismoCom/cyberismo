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
  TemplateConfiguration,
  TemplateMetadata,
} from '../interfaces/resource-interfaces.js';
import { Template } from '../containers/template.js';
import { writeJsonFile } from '../utils/json.js';

/**
 * Template resource class.
 */
export class TemplateResource extends FolderResource {
  private cardContainer: Template;
  private cardsFolder = '';
  private cardsSchema = super.contentSchemaContent('cardBaseSchema');

  constructor(project: Project, name: ResourceName) {
    super(project, name, 'templates');

    this.contentSchemaId = 'templateSchema';
    this.contentSchema = super.contentSchemaContent(this.contentSchemaId);

    this.initialize();
    this.cardsFolder = join(this.internalFolder, 'c');

    // Each template resource contains a template card container (with template cards).
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
   * Returns content data.
   */
  public get data(): TemplateMetadata {
    return super.data as TemplateMetadata;
  }

  /**
   * Deletes file and folder that this resource is based on.
   */
  public async delete() {
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
  public async show(): Promise<TemplateConfiguration> {
    const templateMetadata = (await super.show()) as TemplateMetadata;
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
   * @param key Key to modify
   * @param op Operation to perform on 'key'
   * @throws if key is unknown.
   */
  public async update<Type>(key: string, op: Operation<Type>) {
    const nameChange = key === 'name';
    const existingName = this.content.name;

    // Only call super.update for keys that base class supports
    if (key === 'name' || key === 'displayName' || key === 'description') {
      await super.update(key, op);
    }

    const content = structuredClone(this.content) as TemplateMetadata;

    if (key === 'name') {
      content.name = super.handleScalar(op) as string;
    } else if (key === 'displayName') {
      content.displayName = super.handleScalar(op) as string;
    } else if (key === 'description') {
      content.description = super.handleScalar(op) as string;
    } else if (key === 'category') {
      content.category = super.handleScalar(op) as string;
    } else {
      throw new Error(`Unknown property '${key}' for Template`);
    }

    await super.postUpdate(content, key, op);

    // Renaming this template causes that references to its name must be updated.
    if (nameChange) {
      await this.onNameChange(existingName);
    }
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
   * Validates template.
   * @throws when there are validation errors.
   * @param content Content to be validated.
   * @note If content is not provided, base class validation will use resource's current content.
   */
  public async validate(content?: object) {
    return super.validate(content);
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
