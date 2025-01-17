/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// node
import { assert } from 'node:console';
import { EventEmitter } from 'node:events';
import { basename, join, sep } from 'node:path';
import { rename, readFile, writeFile } from 'node:fs/promises';

import { Calculate } from './calculate.js';
import { Card, Resource } from './interfaces/project-interfaces.js';
import { Project, ResourcesFrom } from './containers/project.js';
import { resourceName } from './utils/resource-utils.js';
import { Template } from './containers/template.js';

import { CardTypeResource } from './resources/card-type-resource.js';
import { FieldTypeResource } from './resources/field-type-resource.js';
import { LinkTypeResource } from './resources/link-type-resource.js';
import { ReportResource } from './resources/report-resource.js';
import { TemplateResource } from './resources/template-resource.js';
import { WorkflowResource } from './resources/workflow-resource.js';

/**
 * Class that handles 'rename' command.
 */
export class Rename extends EventEmitter {
  private from: string = '';
  private to: string = '';

  constructor(
    private project: Project,
    private calculateCmd: Calculate,
  ) {
    super();

    this.addListener(
      'renamed',
      this.calculateCmd.generate.bind(this.calculateCmd),
    );
  }

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
    // First update cards content and metadata
    for (const card of sortedCards) {
      await this.updateCardContent(re, card);
      await this.updateCardLinks(re, card);
    }
    // Then rename the cards
    for (const card of sortedCards) {
      await this.renameCard(re, card);
    }
  }

  // Update card's attachments (both the files and the references to them)
  private async updateCardAttachments(re: RegExp, card: Card) {
    if (!Project.isTemplateCard(card)) {
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

  // Update card's content. Ensures that cards that have been updated are the only ones saved to disk.
  private async updateCardContent(re: RegExp, card: Card) {
    // Ensure that modules are not updated.
    if (card.path.includes(`${sep}modules${sep}`)) {
      return;
    }
    if (!card.content) {
      return;
    }

    const originalContent = card.content?.slice(0);

    // Attachments
    card.content = await this.updateCardAttachments(re, card);
    // Macros
    card.content = await this.updateCardMacros(card);
    // XRefs
    card.content = await this.updateCardXrefs(card);

    // Update changed card's content.
    if (card.content !== originalContent) {
      await this.project.updateCardContent(card.key, card.content!, true);
    }
  }

  // Rename card links.
  private async updateCardLinks(re: RegExp, card: Card) {
    const links = card.metadata?.links ?? [];
    let changed = false;
    // Ensure that modules are not updated.
    if (card.path.includes(`${sep}modules${sep}`)) {
      return;
    }
    links.forEach((link) => {
      const copyCardKey = link.cardKey.slice(0);
      const copyLinkType = link.linkType.slice(0);
      link.cardKey = link.cardKey.replace(re, this.to);
      link.linkType = link.linkType.replace(re, this.to);
      changed ||=
        copyCardKey !== link.cardKey || copyLinkType !== link.linkType;
    });
    if (card.metadata && changed) {
      this.project.updateCardMetadata(card, card.metadata, true);
    }
  }

  // Update card's macros
  private async updateCardMacros(card: Card) {
    if (!card.content) {
      return;
    }

    const conversionMap = new Map([
      [`${this.from}/calculations/`, `${this.to}/calculations/`],
      [`${this.from}/cardTypes/`, `${this.to}/cardTypes/`],
      [`${this.from}/fieldTypes/`, `${this.to}/fieldTypes/`],
      [`${this.from}/linkTypes/`, `${this.to}/linkTypes/`],
      [`${this.from}/reports/`, `${this.to}/reports/`],
      [`${this.from}/templates/`, `${this.to}/templates/`],
      [`${this.from}/workflows/`, `${this.to}/workflows/`],
    ]);
    for (const [key, value] of conversionMap) {
      const re = new RegExp(key, 'g');
      card.content = card.content.replace(re, value);
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
        const skipValidation = true;
        await this.project.updateCardMetadata(
          card,
          card.metadata,
          skipValidation,
        );
      }
    }
  }

  // Update card content's xref links that refer to other cards.
  private async updateCardXrefs(card: Card) {
    const xrefsRe = new RegExp(`xref:${this.from}_`, 'g');
    return card.content?.replace(xrefsRe, `xref:${this.to}_`);
  }

  // Changes the name of a resource to match the new prefix.
  private updateResourceName(name: string) {
    const { identifier, prefix, type } = resourceName(name);
    // do not rename module resources
    return this.from === prefix
      ? `${this.project.configuration.cardKeyPrefix}/${type}/${identifier}`
      : name;
  }

  // Updates single calculation file.
  private async updateCalculationFile(calculation: Resource) {
    if (!calculation.path) {
      throw new Error(
        `Calculation file's '${calculation.name}' path is not defined`,
      );
    }
    const filename = join(calculation.path, basename(calculation.name));
    let content = (await readFile(filename)).toString();
    const conversionMap = new Map([
      [`${this.from}/calculations/`, `${this.to}/calculations/`],
      [`${this.from}/cardTypes/`, `${this.to}/cardTypes/`],
      [`${this.from}/fieldTypes/`, `${this.to}/fieldTypes/`],
      [`${this.from}/linkTypes/`, `${this.to}/linkTypes/`],
      [`${this.from}/reports/`, `${this.to}/reports/`],
      [`${this.from}/templates/`, `${this.to}/templates/`],
      [`${this.from}/workflows/`, `${this.to}/workflows/`],
    ]);
    for (const [key, value] of conversionMap) {
      const re = new RegExp(key, 'g');
      content = content.replace(re, value);
    }
    await writeFile(filename, content);
  }

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

    // Rename resources - module content shall not be modified.
    // It is better to rename the resources in this order: card types, field types

    // Rename all card types and custom fields in them.
    const cardTypes = await this.project.cardTypes(ResourcesFrom.localOnly);
    for (const cardType of cardTypes) {
      await this.updateCardTypeMetadata(cardType.name);
    }
    console.info('Updated card types');

    // Rename all different resources.

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

    // Rename resource usage in all calculation files.
    const calculations = await this.project.calculations(
      ResourcesFrom.localOnly,
    );
    for (const calculation of calculations) {
      await this.updateCalculationFile(calculation);
    }
    console.info('Updated calculations');

    this.project.collectLocalResources();
    console.info('Collected renamed resources');

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

    this.emit('renamed');
  }
}
