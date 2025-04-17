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

import { Calculate } from './index.js';
import { Card } from '../interfaces/project-interfaces.js';
import { isTemplateCard } from '../utils/card-utils.js';
import { Project, ResourcesFrom } from '../containers/project.js';
import { resourceName } from '../utils/resource-utils.js';
import { Template } from '../containers/template.js';

import { CardTypeResource } from '../resources/card-type-resource.js';
import { FieldTypeResource } from '../resources/field-type-resource.js';
import { GraphModelResource } from '../resources/graph-model-resource.js';
import { GraphViewResource } from '../resources/graph-view-resource.js';
import { LinkTypeResource } from '../resources/link-type-resource.js';
import { ReportResource } from '../resources/report-resource.js';
import { TemplateResource } from '../resources/template-resource.js';
import { WorkflowResource } from '../resources/workflow-resource.js';

const FILE_TYPES_WITH_PREFIX_REFERENCES = ['adoc', 'hbs', 'json', 'lp'];

/**
 * Class that handles 'rename' command.
 */
export class Rename {
  private from: string = '';
  private to: string = '';

  constructor(
    private project: Project,
    private calculateCmd: Calculate,
  ) {}

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

          const attachmentRe = new RegExp(`image::${attachment.fileName}`, 'g');
          card.content = card.content?.replace(
            attachmentRe,
            `image::${newAttachmentFileName}`,
          );
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
    files.forEach(async (item) => {
      const target = join(item.parentPath, item.name);
      let fileContent = await readFile(target, {
        encoding: 'utf-8',
      });
      for (const [key, value] of conversionMap) {
        const re = new RegExp(key, 'g');
        fileContent = fileContent.replaceAll(re, value);
      }
      await writeFile(target, fileContent);
    });
  }

  // Changes the name of a resource to match the new prefix.
  private updateResourceName(name: string) {
    const { identifier, prefix, type } = resourceName(name);
    // do not rename module resources
    return this.from === prefix
      ? `${this.project.configuration.cardKeyPrefix}/${type}/${identifier}`
      : name;
  }

  // @todo: merge all update-functions
  // Updates card type's metadata.
  private async updateCardTypeMetadata(cardTypeName: string) {
    const cardType = new CardTypeResource(
      this.project,
      resourceName(cardTypeName),
    );
    return cardType.rename(resourceName(this.updateResourceName(cardTypeName)));
  }

  // Updates field type's metadata.
  private async updateFieldTypeMetadata(fieldTypeName: string) {
    const fieldType = new FieldTypeResource(
      this.project,
      resourceName(fieldTypeName),
    );
    return fieldType.rename(
      resourceName(this.updateResourceName(fieldTypeName)),
    );
  }

  // Updates graph model's metadata.
  private async updateGraphModelMetadata(graphModelName: string) {
    const graphModel = new GraphModelResource(
      this.project,
      resourceName(graphModelName),
    );
    return graphModel.rename(
      resourceName(this.updateResourceName(graphModelName)),
    );
  }

  // Updates graph view's metadata.
  private async updateGraphViewMetadata(graphViewName: string) {
    const graphView = new GraphViewResource(
      this.project,
      resourceName(graphViewName),
    );
    return graphView.rename(
      resourceName(this.updateResourceName(graphViewName)),
    );
  }

  // Updates link type's metadata.
  private async updateLinkTypeMetadata(linkTypeName: string) {
    const linkType = new LinkTypeResource(
      this.project,
      resourceName(linkTypeName),
    );
    return linkType.rename(resourceName(this.updateResourceName(linkTypeName)));
  }

  // Updates reports' metadata.
  private async updateReport(reportName: string) {
    const report = new ReportResource(this.project, resourceName(reportName));
    return report.rename(resourceName(this.updateResourceName(reportName)));
  }

  // Rename templates.
  private async updateTemplate(templateName: string) {
    const template = new TemplateResource(
      this.project,
      resourceName(templateName),
    );
    return template.rename(resourceName(this.updateResourceName(templateName)));
  }

  // Rename workflows.
  private async updateWorkflowMetadata(workflowName: string) {
    const workflow = new WorkflowResource(
      this.project,
      resourceName(workflowName),
    );
    return workflow.rename(resourceName(this.updateResourceName(workflowName)));
  }

  /**
   * Renames project prefix.
   * @throws if trying to use empty 'to'
   * @throws if trying to rename with current name
   * @param to Card id, or template name
   */
  public async rename(to: string) {
    if (!to) {
      throw new Error(`Input validation error: empty 'to' is not allowed`);
    }
    const cardContent = {
      metadata: true,
      attachments: true,
      content: true,
    };

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
    this.project.collectLocalResources();

    // Rename local resources.
    // It is better to rename the resources in this order: card types, field types, then others

    // Rename all card types and custom fields in them.
    const cardTypes = await this.project.cardTypes(ResourcesFrom.localOnly);
    for (const cardType of cardTypes) {
      await this.updateCardTypeMetadata(cardType.name);
    }
    console.info('Updated card types');

    const workflows = await this.project.workflows(ResourcesFrom.localOnly);
    for (const workflow of workflows) {
      await this.updateWorkflowMetadata(workflow.name);
    }
    console.info('Updated workflows');

    const fieldTypes = await this.project.fieldTypes(ResourcesFrom.localOnly);
    for (const fieldType of fieldTypes) {
      await this.updateFieldTypeMetadata(fieldType.name);
    }
    console.info('Updated field types');

    const graphModels = await this.project.graphModels(ResourcesFrom.localOnly);
    for (const graphModel of graphModels) {
      await this.updateGraphModelMetadata(graphModel.name);
    }
    console.info('Updated graph models');

    const graphViews = await this.project.graphViews(ResourcesFrom.localOnly);
    for (const graphView of graphViews) {
      await this.updateGraphViewMetadata(graphView.name);
    }
    console.info('Updated graph views');

    const linkTypes = await this.project.linkTypes(ResourcesFrom.localOnly);
    for (const linkType of linkTypes) {
      await this.updateLinkTypeMetadata(linkType.name);
    }
    console.info('Updated link types');

    const reports = await this.project.reports(ResourcesFrom.localOnly);
    for (const report of reports) {
      await this.updateReport(report.name);
    }
    console.info('Updated reports');

    let templates = await this.project.templates(ResourcesFrom.localOnly);
    for (const template of templates) {
      await this.updateTemplate(template.name);
    }
    console.info('Updated templates');

    // Rename all local template cards.
    templates = await this.project.templates(ResourcesFrom.localOnly);
    for (const template of templates) {
      const templateObject = new Template(this.project, template);
      await this.renameCards(await templateObject.cards('', cardContent));
    }
    console.info('Renamed template cards and updated the content');

    // Rename all project cards.
    await this.renameCards(
      await this.project.cards(this.project.paths.cardRootFolder, cardContent),
    );
    console.info('Renamed project cards and updated the content');

    await this.updateFiles(this.project.paths.cardRootFolder);
    console.info('Renamed all remaining references in cardRoot folder');
    await this.updateFiles(this.project.paths.resourcesFolder);
    console.info('Renamed all remaining references in .cards folder');

    // It is best that the resources are re-collected after all the renaming has occurred.
    this.project.collectLocalResources();
    console.info('Collected renamed resources');

    return this.calculateCmd.generate();
  }
}
