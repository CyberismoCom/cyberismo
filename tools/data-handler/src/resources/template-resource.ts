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
import { writeJsonFileIfAbsent } from '../utils/json.js';

import type { Card } from '../interfaces/project-interfaces.js';
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
  private cardContainer: Template;
  private cardContainerName = '';
  private cardsFolder = '';
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

    this.cardsFolder = join(this.internalFolder, 'c');
    this.cardContainer = this.createCardContainer();
  }

  // Each template resource contains a template card container (with template
  // cards). The container bakes in the resource's name and path, so it has to
  // be rebuilt whenever either of those changes.
  // todo: Fix Template constructor not to use Resource, but just this filename with path
  private createCardContainer(): Template {
    this.cardContainerName = resourceNameToString(this.resourceName);
    return new Template(this.project, {
      name: this.cardContainerName,
      path: dirname(this.fileName),
    });
  }

  /**
   * Sets new metadata into the template object.
   * @param newContent metadata content for the template.
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
    this.project.removeTemplateTree(resourceNameToString(this.resourceName));
    return super.delete();
  }

  /**
   * Renames the template and reloads its cards into the project's card cache.
   *
   * A template card is cached under its template's name and under its path on
   * disk, and renaming the template moves the folder and changes the name.
   * Without this, every card of the renamed template stays in the cache
   * pointing at a folder that no longer exists, and the template reads as
   * empty for the rest of the session.
   * @param newIdentifier New identifier for the template.
   */
  public async rename(newIdentifier: string) {
    const oldName = resourceNameToString(this.resourceName);
    await super.rename(newIdentifier);
    // The cards move with the template: same cards, new name, new folder. No
    // reload, because their paths are derived from the folder.
    this.project.renameTemplateTree(
      oldName,
      resourceNameToString(this.resourceName),
      this.cardsFolder,
    );
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
      numberOfCards: container.cardCount(),
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

    // super.write() renames the metadata file and the content folder when the
    // resource's name has changed; the card container still points at the old
    // name and the old folder until it is rebuilt.
    if (this.cardContainerName !== resourceNameToString(this.resourceName)) {
      this.cardContainer = this.createCardContainer();
    }

    // The template's cards are rooted at its 'c' folder. Registered on every
    // write, so a card created into a template that has just been created -
    // or just renamed - has somewhere to be derived from.
    this.project.registerTemplateCardsFolder(
      resourceNameToString(this.resourceName),
      this.cardsFolder,
    );

    // Create folder for cards and put proper content schema file there
    const schemaContentFile = join(this.cardsFolder, '.schema');
    await mkdir(this.cardsFolder, { recursive: true });
    await writeJsonFileIfAbsent(schemaContentFile, this.cardsSchema);
  }
}
