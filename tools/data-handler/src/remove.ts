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
import { join, sep } from 'node:path';

import { ActionGuard } from './permissions/action-guard.js';
import { Calculate } from './calculate.js';
import { deleteDir, deleteFile } from './utils/file-utils.js';
import { Project } from './containers/project.js';
import {
  RemovableResourceTypes,
  Resource,
} from './interfaces/project-interfaces.js';
import { resourceNameParts } from './utils/resource-utils.js';

const MODULES_PATH = `${sep}modules${sep}`;

export class Remove extends EventEmitter {
  constructor(
    private project: Project,
    private calculateCmd: Calculate,
  ) {
    super();
  }

  // True, if resource is based on a single JSON file.
  private fileBasedResource(type: RemovableResourceTypes): boolean {
    return (
      type === 'cardType' ||
      type === 'fieldType' ||
      type === 'linkType' ||
      type === 'workflow'
    );
  }
  // True, if resource is based on a content of folder with multiple files.
  private folderBasedResource(type: RemovableResourceTypes): boolean {
    return type === 'report' || type === 'template';
  }

  // Remove file based resource (card type, field type, ...)
  private async deleteFileResource(resourceName: string) {
    if (!resourceName.endsWith('.json')) {
      resourceName += '.json';
    }
    const { identifier, type } = resourceNameParts(resourceName);
    let resources: Resource[];
    let resourceFolder: string = '';
    if (type === 'cardTypes') {
      resourceFolder = this.project.paths.cardTypesFolder;
      resources = await this.project.cardTypes();
    } else if (type == 'fieldTypes') {
      resourceFolder = this.project.paths.fieldTypesFolder;
      resources = await this.project.fieldTypes();
    } else if (type == 'linkTypes') {
      resourceFolder = this.project.paths.linkTypesFolder;
      resources = await this.project.linkTypes();
    } else if (type == 'workflows') {
      resourceFolder = this.project.paths.workflowsFolder;
      resources = await this.project.workflows();
    } else {
      resources = [];
    }
    const resource = resources.filter((item) => item.name === resourceName)[0];
    if (!resource || !resource.path) {
      throw new Error(
        `Resource '${resourceName}' does not exist in the project`,
      );
    }
    if (resource.path?.includes(MODULES_PATH)) {
      throw new Error(`Cannot modify imported module`);
    }

    const resourceFile = join(resourceFolder, identifier + '.json');
    const deleted = await deleteFile(resourceFile);
    if (!deleted) {
      throw new Error(`Cannot delete file ${resourceFile}`);
    }

    this.project.removeResource(resource);
  }

  // Remove folder-based resource (template, report, ...).
  private async deleteFolderResource(resourceName: string) {
    const { type } = resourceNameParts(resourceName);
    let resources: Resource[];
    if (type === 'templates') {
      resources = await this.project.templates();
    } else if (type === 'reports') {
      resources = await this.project.reports();
    } else {
      resources = [];
    }
    const resource = resources.filter((item) => item.name === resourceName)[0];

    if (!resource || !resource.path) {
      throw new Error(
        `Resource '${resourceName}' does not exist in the project`,
      );
    }

    const resourcePath = join(
      resource.path,
      resourceNameParts(resource.name).identifier,
    );

    if (resourcePath.includes(MODULES_PATH)) {
      throw new Error(`Cannot modify imported module`);
    }

    await deleteDir(resourcePath);
    this.project.removeResource(resource);
  }

  // Removes attachment from template or project card
  private async removeAttachment(cardKey: string, attachment?: string) {
    if (!attachment) {
      throw new Error(`Attachment filename required`);
    }

    const attachmentFolder = await this.project.cardAttachmentFolder(cardKey);
    if (!attachmentFolder) {
      throw new Error(`Card '${cardKey}' not found`);
    }

    // Imported templates cannot be modified.
    if (attachmentFolder.includes(MODULES_PATH)) {
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
    const cardFolder = await this.project.cardFolder(cardKey);
    if (!cardFolder) {
      throw new Error(`Card '${cardKey}' not found`);
    }

    // Imported templates cannot be modified.
    if (cardFolder.includes(MODULES_PATH)) {
      throw new Error(`Cannot modify imported module`);
    }

    // Make sure card can be removed if it's a project card
    if (!(await this.project.isTemplateCard(cardKey))) {
      const actionGuard = new ActionGuard(this.calculateCmd);
      await actionGuard.checkPermission('delete', cardKey);
    }

    // If card is destination of a link, remove the link.
    const allCards = await this.project.cards(
      this.project.paths.cardRootFolder,
      {
        metadata: true,
      },
    );
    const promiseContainer: Promise<void>[] = [];
    allCards.filter((item) => {
      item.metadata?.links.forEach(async (link) => {
        if (link.cardKey === cardKey) {
          promiseContainer.push(this.removeLink(item.key, link.cardKey));
        }
      });
    });
    await Promise.all(promiseContainer);

    // Calculations need to be updated before card is removed.
    const card = await this.project.findSpecificCard(cardKey);
    if (card) {
      await this.calculateCmd.handleDeleteCard(card);
    }
    await deleteDir(cardFolder);

    if (card) {
      this.emit('removed', card);
    }
  }

  // Removes link from project.
  private async removeLink(
    sourceCardKey: string,
    destinationCardKey: string,
    linkType?: string,
    linkDescription?: string,
  ) {
    const sourceCard = await this.project.findSpecificCard(sourceCardKey, {
      metadata: true,
    });
    if (!sourceCard) {
      throw new Error(`Card '${sourceCardKey}' not found`);
    }

    const link = sourceCard.metadata?.links.find(
      (l) =>
        l.cardKey === destinationCardKey &&
        (!linkType || l.linkType === linkType) &&
        (!linkDescription || l.linkDescription === linkDescription),
    );
    if (!link) {
      throw new Error(
        linkType
          ? `Link from '${sourceCardKey}' to '${destinationCardKey}' with link type '${linkType}' not found`
          : `Link from '${sourceCardKey}' to '${destinationCardKey}' not found`,
      );
    }

    const newLinks = sourceCard.metadata?.links.filter(
      (l) =>
        l.cardKey !== destinationCardKey ||
        (linkType && l.linkType !== linkType) ||
        (linkDescription && l.linkDescription !== linkDescription),
    );

    await this.project.updateCardMetadataKey(sourceCardKey, 'links', newLinks);
  }

  // Removes modules from project
  private async removeModule(moduleName: string) {
    const module = await this.project.modulePath(moduleName);
    if (!module) {
      throw new Error(`Module '${moduleName}' not found`);
    }
    await deleteDir(module);
    await this.project.collectModuleResources();
  }

  /**
   * Removes either attachment, card, imported module, link or resource from project.
   * @param type Type of resource
   * @param targetName Card id, resource name, or other identifying item
   * @param rest Additional arguments
   * @note removing attachment requires card id and attachment filename
   * @note removing link requires card ids of source card, and optionally link type and link description
   *
   */
  public async remove(
    type: RemovableResourceTypes,
    targetName: string,
    ...rest: any[] // eslint-disable-line @typescript-eslint/no-explicit-any
  ) {
    if (type === 'attachment' && rest.length !== 1 && !rest[0]) {
      throw new Error(
        `Input validation error: must pass argument 'detail' if requesting to remove attachment`,
      );
    }

    if (
      type === 'link' &&
      [2, 3].includes(rest.length) &&
      !rest[0] &&
      !rest[1]
    ) {
      throw new Error(
        `Input validation error: must pass arguments 'source', 'destination' and possibly 'linkType' if requesting to remove link`,
      );
    }
    if (this.fileBasedResource(type)) {
      return this.deleteFileResource(targetName);
    } else if (this.folderBasedResource(type)) {
      return this.deleteFolderResource(targetName);
    } else {
      // Something else than resources...
      if (type == 'attachment')
        return this.removeAttachment(targetName, rest[0]);
      else if (type == 'card') return this.removeCard(targetName);
      else if (type == 'link')
        return this.removeLink(targetName, rest[0], rest[1], rest.at(2));
      else if (type == 'module') return this.removeModule(targetName);
    }
    throw new Error(`Unknown resource type '${type}'`);
  }
}
