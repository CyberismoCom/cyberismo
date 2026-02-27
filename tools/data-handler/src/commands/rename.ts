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

// node
import { assert } from 'node:console';
import { join } from 'node:path';
import { rename, readdir, readFile, writeFile } from 'node:fs/promises';

import type { Card } from '../interfaces/project-interfaces.js';
import {
  ConfigurationLogger,
  ConfigurationOperation,
} from '../utils/configuration-logger.js';
import { isTemplateCard } from '../utils/card-utils.js';
import { type Project, ResourcesFrom } from '../containers/project.js';
import { resourceName } from '../utils/resource-utils.js';
import { write } from '../utils/rw-lock.js';

const FILE_TYPES_WITH_PREFIX_REFERENCES = ['adoc', 'hbs', 'json', 'lp'];

/**
 * Class that handles 'rename' command.
 */
export class Rename {
  private from: string = '';
  private to: string = '';

  /**
   * Creates an instance of Rename command.
   * @param project Project instance to use.
   */
  constructor(private project: Project) {}

  // Renames a card and all of its attachments (if it is a project card).
  private async renameCard(re: RegExp, card: Card): Promise<void> {
    // Update card's metadata
    await this.updateCardMetadata(card);

    // Then rename card file.
    const newCardPath = card.path.replace(re, this.to);
    await rename(card.path, newCardPath);
  }

  // Update all the cards in a container.
  // Sort cards so that cards that deeper in file hierarchy are renamed first.
  private async renameCards(cards: Card[]): Promise<void> {
    // Sort cards by path length (so that renaming starts from children)
    function sortCards(a: Card, b: Card) {
      if (a.path.length > b.path.length) {
        return -1;
      }
      if (a.path.length < b.path.length) {
        return 1;
      }
      return 0;
    }

    // Ensure that only last occurrence is replaced, since path can contain "project prefixes" that are not to be touched.
    //   E.g. /Users/smith/projects/card-projects/smith-project/cardRoot/smith_sdhgsd7; change 'smith' card key to 'miller'
    //   --> only the last 'smith' should be replaced with 'miller'.
    const re = new RegExp(`${this.from}(?!.*${this.from})`);
    const sortedCards = cards.sort((a, b) => sortCards(a, b));

    // Cannot do this parallel, since cards deeper in the hierarchy needs to be renamed first.
    for (const card of sortedCards) {
      // Attachments
      card.content = await this.updateCardAttachments(re, card);
      await this.renameCard(re, card);
    }
  }

  // Checks if file's extension is one that might contain project prefix references.
  private scanExtensions(fileName: string): boolean {
    // If file does not contain a dot, then it cannot have extension.
    // Disqualify all files starting with dot as well.
    if (!fileName || !fileName.includes('.') || fileName.at(0) === '.') {
      return false;
    }

    const extension = fileName.split('.').pop() || '';
    return FILE_TYPES_WITH_PREFIX_REFERENCES.includes(extension);
  }

  // Update card's attachments (both the files and the references to them)
  private async updateCardAttachments(re: RegExp, card: Card) {
    if (!isTemplateCard(card)) {
      const attachments = card.attachments ? card.attachments : [];
      await Promise.all(
        attachments.map(async (attachment) => {
          const newAttachmentFileName = attachment.fileName.replace(
            re,
            this.to,
          );
          await rename(
            join(attachment.path, attachment.fileName),
            join(attachment.path, newAttachmentFileName),
          );
          // NOTE: content is renamed by updateFiles method
        }),
      );
    }
    return card.content;
  }

  // Update card's metadata.
  private async updateCardMetadata(card: Card) {
    if (card.metadata?.cardType && card.metadata?.cardType.length > 0) {
      const { identifier, prefix, type } = resourceName(card.metadata.cardType);
      if (prefix === this.from) {
        card.metadata.cardType = `${this.project.configuration.cardKeyPrefix}/${type}/${identifier}`;
        // Update card' custom fields
        const keys = Object.keys(card.metadata);
        for (const oldKey of keys) {
          if (oldKey.startsWith(`${this.from}/fieldTypes`)) {
            const newKey = this.updateResourceName(oldKey);
            // one-liner to remove the old key and add a new one
            delete Object.assign(card.metadata, {
              [newKey]: card.metadata[oldKey],
            })[oldKey];
          }
        }
        await this.project.updateCardMetadata(card, card.metadata);
      }
    }
  }

  private async updateFiles(location: string) {
    const conversionMap = new Map([
      [`${this.from}/calculations/`, `${this.to}/calculations/`],
      [`${this.from}/cardTypes/`, `${this.to}/cardTypes/`],
      [`${this.from}/fieldTypes/`, `${this.to}/fieldTypes/`],
      [`${this.from}/linkTypes/`, `${this.to}/linkTypes/`],
      [`${this.from}/reports/`, `${this.to}/reports/`],
      [`${this.from}/templates/`, `${this.to}/templates/`],
      [`${this.from}/workflows/`, `${this.to}/workflows/`],
      [`${this.from}_`, `${this.to}_`],
    ]);
    // Collect all supported file types from the location.
    const files = (
      await readdir(location, {
        recursive: true,
        withFileTypes: true,
      })
    ).filter(
      (item) =>
        item.isFile() &&
        item.name !== '.schema' &&
        this.scanExtensions(item.name),
    );

    // Then replace all values that match in the conversion map.
    await Promise.all(
      files.map(async (item) => {
        const target = join(item.parentPath, item.name);
        let fileContent = await readFile(target, { encoding: 'utf-8' });
        for (const [key, value] of conversionMap) {
          const re = new RegExp(key, 'g');
          fileContent = fileContent.replace(re, value);
        }
        await writeFile(target, fileContent);
      }),
    );
  }

  // Changes the name of a resource to match the new prefix.
  private updateResourceName(name: string) {
    const { identifier, prefix, type } = resourceName(name);
    // do not rename module resources
    return this.from === prefix
      ? `${this.project.configuration.cardKeyPrefix}/${type}/${identifier}`
      : name;
  }

  /**
   * Renames project prefix.
   * @throws if trying to use empty 'to'
   * @throws if trying to rename with current name
   * @param to Card id, or template name
   */
  @write((to) => `Rename project prefix to ${to}`)
  public async rename(to: string) {
    if (!to) {
      throw new Error(`Input validation error: empty 'to' is not allowed`);
    }

    this.from = this.project.configuration.cardKeyPrefix;
    this.to = to;
    assert(this.from !== '');
    assert(this.to !== '');

    if (this.from === this.to) {
      throw new Error(`Project prefix is already '${this.from}'`);
    }

    // Change project prefix to project settings.
    await this.project.configuration.setCardPrefix(to);
    console.info(`Rename: New prefix: '${this.project.projectPrefix}'`);
    // Update the resources collection, since project prefix has changed.
    this.project.resources.changed();

    // Rename local resources.
    // It is better to rename the resources in this order: card types, workflows, field types, then the rest

    // Rename all card types and custom fields in them.
    for (const cardType of this.project.resources.cardTypes(
      ResourcesFrom.localOnly,
    )) {
      const name = this.updateResourceName(cardType.data?.name || '');
      await cardType.rename(resourceName(name));
    }
    console.info('Updated card types');

    for (const workflow of this.project.resources.workflows(
      ResourcesFrom.localOnly,
    )) {
      const name = this.updateResourceName(workflow.data?.name || '');
      await workflow.rename(resourceName(name));
    }
    console.info('Updated workflows');

    for (const fieldType of this.project.resources.fieldTypes(
      ResourcesFrom.localOnly,
    )) {
      const name = this.updateResourceName(fieldType.data?.name || '');
      await fieldType.rename(resourceName(name));
    }
    console.info('Updated field types');

    const restOfResourceTypes = [
      'graphModels',
      'graphViews',
      'linkTypes',
      'reports',
      'templates',
      'calculations',
    ] as const;

    for (const resourceType of restOfResourceTypes) {
      for (const resource of this.project.resources.resourceTypes(
        resourceType,
        ResourcesFrom.localOnly,
      )) {
        const name = this.updateResourceName(resource.data?.name || '');
        await resource.rename(resourceName(name));
      }
    }

    // Rename all local template cards. This must be done after calculations have been renamed.
    for (const template of this.project.resources.templates(
      ResourcesFrom.localOnly,
    )) {
      const templateObject = template.templateObject();
      await this.renameCards(templateObject.cards());
    }
    console.info('Renamed template cards and updated the content');

    // Rename all project cards.
    await this.renameCards(
      this.project.cards(this.project.paths.cardRootFolder),
    );
    console.info('Renamed project cards and updated the content');

    await this.updateFiles(this.project.paths.cardRootFolder);
    console.info('Renamed all remaining references in cardRoot folder');
    await this.updateFiles(
      this.project.paths.versionedResourcesFolderFor(
        this.project.configuration.latestVersion,
      ),
    );
    console.info('Renamed all remaining references in .cards folder');

    // It is best that the resources are re-collected after all the renaming has occurred.
    this.project.resources.changed();
    console.info('Collected renamed resources');

    // Remove these when operations properly update card cache
    this.project.cardsCache.clear();
    await this.project.populateCaches();

    await ConfigurationLogger.log(
      this.project.basePath,
      ConfigurationOperation.PROJECT_RENAME,
      this.to,
      {},
      this.project.configuration.latestVersion,
    );

    return this.project.calculationEngine.generate();
  }
}
