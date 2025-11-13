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

import { ActionGuard } from '../permissions/action-guard.js';
import { isModuleCard } from '../utils/card-utils.js';
import { ModuleManager } from '../module-manager.js';
import type { Project } from '../containers/project.js';
import type { RemovableResourceTypes } from '../interfaces/project-interfaces.js';

/**
 * Remove command.
 */
export class Remove {
  private moduleManager: ModuleManager;
  /**
   * Creates a new instance of Remove command.
   * @param project Project instance to use
   */
  constructor(private project: Project) {
    this.moduleManager = new ModuleManager(this.project);
  }

  // True, if resource is a project resource
  private projectResource(type: RemovableResourceTypes): boolean {
    return (
      type === 'calculation' ||
      type === 'cardType' ||
      type === 'fieldType' ||
      type === 'graphModel' ||
      type === 'graphView' ||
      type === 'linkType' ||
      type === 'report' ||
      type === 'template' ||
      type === 'workflow'
    );
  }

  // Removes attachment from template or project card
  private async removeAttachment(cardKey: string, attachment?: string) {
    if (!attachment) {
      throw new Error(`Attachment filename required`);
    }

    return this.project.removeCardAttachment(cardKey, attachment);
  }

  // Removes card from project or template
  private async removeCard(cardKey: string) {
    const card = this.project.findCard(cardKey);

    // Imported templates cannot be modified.
    if (isModuleCard(card)) {
      throw new Error(`Cannot modify imported module`);
    }

    // Make sure card can be removed if it's a project card
    if (this.project.hasProjectCard(cardKey)) {
      const actionGuard = new ActionGuard(this.project.calculationEngine);
      await actionGuard.checkPermission('delete', cardKey);
    }

    // If card is destination of a link, remove the link.
    const allCards = this.project.cards(this.project.paths.cardRootFolder);
    const promiseContainer: Promise<void>[] = [];

    for (const item of allCards) {
      const links = item.metadata?.links ?? [];
      for (const link of links) {
        if (link.cardKey === cardKey) {
          promiseContainer.push(this.removeLink(item.key, link.cardKey));
        }
      }
    }

    await Promise.all(promiseContainer);

    if (card) {
      await this.project.handleCardDeleted(card);
    }
  }

  // removes label from project
  private async removeLabel(cardKey: string, label: string) {
    const card = this.project.findCard(cardKey);
    let labels = card.metadata?.labels ?? [];

    if (!label && labels.length !== 1) {
      throw new Error(
        `No label given and ${labels.length === 0 ? 'there are no labels' : 'there are multiple labels'}`,
      );
    }

    if (labels.length !== 1 && !labels.includes(label)) {
      throw new Error(`Label '${label}' does not exist in card ${cardKey}`);
    }
    // remove all labels if there is only 1, otherwise remove all given labels
    labels =
      labels.length === 1
        ? []
        : labels.filter((labelItem) => labelItem !== label);
    return this.project.updateCardMetadataKey(cardKey, 'labels', labels);
  }

  // Removes link from project.
  private async removeLink(
    sourceCardKey: string,
    destinationCardKey: string,
    linkType?: string,
    linkDescription?: string,
  ) {
    const sourceCard = this.project.findCard(sourceCardKey);
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

  // Remove a hub from project.
  private async removeHubLocation(name: string) {
    await this.project.configuration.removeHub(name);
  }

  /**
   * Removes either attachment, card, imported module, link or resource from project.
   * @param type Type of resource
   * @param targetName Card id, resource name, or other identifying item
   * @param rest Additional arguments
   * @note removing attachment requires card id and attachment filename
   * @note removing link requires card ids of source card, and optionally link type and link description
   * @throws when removing an attachment, but attachment parameter is missing, or
   *         when removing link, some of the mandatory parameters are missing, or
   *         when trying to remove unknown type
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
    if (this.projectResource(type)) {
      const resource = this.project.resources.byType(
        targetName,
        this.project.resources.resourceTypeFromSingularType(type),
      );
      return resource?.delete();
    } else {
      // Something else than resources...
      if (type === 'attachment')
        return this.removeAttachment(targetName, rest[0]);
      else if (type === 'card') return this.removeCard(targetName);
      else if (type === 'hub') return this.removeHubLocation(targetName);
      else if (type === 'label') return this.removeLabel(targetName, rest[0]);
      else if (type === 'link')
        return this.removeLink(targetName, rest[0], rest[1], rest.at(2));
      else if (type === 'module')
        return this.moduleManager.removeModule(targetName);
    }
    throw new Error(`Unknown resource type '${type}'`);
  }
}
