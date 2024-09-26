/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// node
import { EventEmitter } from 'node:events';
import { basename, join, sep } from 'node:path';

// ismo
import { Calculate } from './calculate.js';
import { deleteDir, deleteFile } from './utils/file-utils.js';
import { Project } from './containers/project.js';

export class Remove extends EventEmitter {
  static project: Project;

  private calculateCmd: Calculate;

  constructor(calculateCmd: Calculate) {
    super();
    this.calculateCmd = calculateCmd;
  }

  // Removes attachment from template or project card
  private async removeAttachment(cardKey: string, attachment?: string) {
    if (!attachment) {
      throw new Error(`Attachment filename required`);
    }

    const attachmentFolder = await Remove.project.cardAttachmentFolder(cardKey);
    if (!attachmentFolder) {
      throw new Error(`Card '${cardKey}' not found`);
    }

    // Imported templates cannot be modified.
    if (attachmentFolder.includes(`${sep}modules${sep}`)) {
      throw new Error(`Cannot modify imported module`);
    }

    // Attachment's reside in 'a' folders.
    const success = await deleteFile(join(attachmentFolder, attachment));
    if (!success) {
      throw new Error('No such file');
    }
  }

  // Removes card from project or template
  private async removeCard(cardKey: string) {
    const cardFolder = await Remove.project.cardFolder(cardKey);
    if (!cardFolder) {
      throw new Error(`Card '${cardKey}' not found`);
    }

    // Imported templates cannot be modified.
    if (cardFolder.includes(`${sep}modules${sep}`)) {
      throw new Error(`Cannot modify imported module`);
    }

    // Calculations need to be updated before card is removed.
    const card = await Remove.project.findSpecificCard(cardKey);
    if (card) {
      await this.calculateCmd.handleDeleteCard(card);
    }
    await deleteDir(cardFolder);

    if (card) {
      this.emit('removed', card);
    }
  }

  /**
   * Removes link from project.
   * @param sourceCardKey Source card id
   * @param destinationCardKey Destination card id
   * @param linkType Linktype name
   * @param linkDescription Link description
   */
  private async removeLink(
    sourceCardKey: string,
    destinationCardKey: string,
    linkType: string,
    linkDescription?: string,
  ) {
    const sourceCard = await Remove.project.findSpecificCard(sourceCardKey, {
      metadata: true,
    });
    if (!sourceCard) {
      throw new Error(`Card '${sourceCardKey}' not found`);
    }

    const link = sourceCard.metadata?.links?.find(
      (l) =>
        l.cardKey === destinationCardKey &&
        l.linkType === linkType &&
        l.linkDescription === linkDescription,
    );
    if (!link) {
      throw new Error(
        `Link from '${sourceCardKey}' to '${destinationCardKey}' with linktype '${linkType}' not found`,
      );
    }

    const newLinks = sourceCard.metadata?.links?.filter(
      (l) =>
        l.cardKey !== destinationCardKey ||
        l.linkType !== linkType ||
        l.linkDescription !== linkDescription,
    );

    await Remove.project.updateCardMetadataKey(
      sourceCardKey,
      'links',
      newLinks,
    );
  }

  /**
   * Removes linktype from project.
   * @param linktypeName Linktype name
   */
  private async removeLinktype(linkTypeName: string) {
    const path = await Remove.project.linkTypePath(linkTypeName);
    if (!path) {
      throw new Error(`Linktype '${linkTypeName}' not found`);
    }
    await deleteFile(path);
  }

  // Removes modules from project
  private async removeModule(moduleName: string) {
    const module = await Remove.project.modulePath(moduleName);
    if (!module) {
      throw new Error(`Module '${moduleName}' not found`);
    }
    await deleteDir(module);
  }

  // Removes template from project
  private async removeTemplate(templateName: string) {
    const template = await Remove.project.template(templateName);
    if (!template || !template.path) {
      throw new Error(
        `Template '${templateName}' does not exist in the project`,
      );
    }

    // Remove module|project from Template path
    const templatePath = join(template.path, basename(template.name));

    // Imported templates cannot be modified.
    if (templatePath.includes(`${sep}modules${sep}`)) {
      throw new Error(`Cannot modify imported module`);
    }

    await deleteDir(templatePath);
  }

  /**
   * Removes either attachment, card or template from project.
   * @param {string} projectPath Path to a project
   * @param {string} targetName Card id, or template name
   * @param {string} args Additional arguments, such as attachment filename
   */
  public async remove(
    projectPath: string,
    type: string,
    targetName: string,
    ...rest: any[] // eslint-disable-line @typescript-eslint/no-explicit-any
  ) {
    Remove.project = new Project(projectPath);
    switch (type) {
      case 'attachment':
        return this.removeAttachment(targetName, rest[0]);
      case 'card':
        return this.removeCard(targetName);
      case 'link':
        return this.removeLink(targetName, rest[0], rest[1], rest.at(2));
      case 'linktype':
        return this.removeLinktype(targetName);
      case 'module':
        return this.removeModule(targetName);
      case 'template':
        return this.removeTemplate(targetName);
      default:
        throw new Error(`Invalid type '${type}'`);
    }
  }
}
