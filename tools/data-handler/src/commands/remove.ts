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
import { isModuleCard, isExternalItemKey } from '../utils/card-utils.js';
import { getChildLogger } from '../utils/log-utils.js';
import { ModuleManager } from '../module-manager.js';
import type { Fetch } from './fetch.js';
import type { Project } from '../containers/project.js';
import type { RemovableResourceTypes } from '../interfaces/project-interfaces.js';
import type { ExternalLink } from '../interfaces/resource-interfaces.js';
import { write } from '../utils/rw-lock.js';

/**
 * Remove command.
 */
export class Remove {
  private moduleManager: ModuleManager;
  private get logger() {
    return getChildLogger({ module: 'remove' });
  }
  /**
   * Creates a new instance of Remove command.
   * @param project Project instance to use
   */
  constructor(
    private project: Project,
    private fetchCmd: Fetch,
  ) {
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

    // Collect all card keys that will be deleted (the card itself and all descendants).
    const cardsToDelete = new Set<string>();
    const collectDescendants = (c: typeof card) => {
      cardsToDelete.add(c.key);
      for (const childKey of c.children) {
        try {
          const childCard = this.project.findCard(childKey);
          collectDescendants(childCard);
        } catch {
          this.logger.debug({ childKey }, 'Child card not found, skipping');
        }
      }
    };
    collectDescendants(card);

    // If any of the cards to be deleted is a destination of a link, remove the link.
    const allCards = this.project.cards(this.project.paths.cardRootFolder);
    const promiseContainer: Promise<void>[] = [];

    for (const item of allCards) {
      if (cardsToDelete.has(item.key) || !item.metadata) continue;
      const links = item.metadata.links;
      const preservedLinks = links.filter((l) => !cardsToDelete.has(l.cardKey));
      if (preservedLinks.length !== links.length) {
        promiseContainer.push(
          this.project.updateCardMetadataKey(item.key, 'links', preservedLinks),
        );
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
  // Detects if source or destination is external and routes accordingly.
  private async removeLink(
    source: string,
    destination: string,
    linkType?: string,
    linkDescription?: string,
    direction?: 'outbound' | 'inbound',
  ) {
    const isExternalSource = isExternalItemKey(source);
    const isExternalDestination = isExternalItemKey(destination);

    if (isExternalSource && isExternalDestination) {
      throw new Error(
        'Cannot remove link between two external items. One must be a card.',
      );
    }

    if (isExternalDestination || isExternalSource) {
      const cardKey = isExternalDestination ? source : destination;
      const externalItem = isExternalDestination ? destination : source;
      // Use provided direction, or auto-detect from argument order
      const effectiveDirection =
        direction ?? (isExternalDestination ? 'outbound' : 'inbound');
      return this.removeExternalLink(
        cardKey,
        externalItem,
        effectiveDirection,
        linkType,
        linkDescription,
      );
    }

    return this.removeLocalLink(source, destination, linkType, linkDescription);
  }

  // Removes card-to-card link from project.
  private async removeLocalLink(
    source: string,
    destination: string,
    linkType?: string,
    linkDescription?: string,
  ) {
    const sourceCard = this.project.findCard(source);
    const link = sourceCard.metadata?.links.find(
      (l) =>
        l.cardKey === destination &&
        l.linkType === (linkType ?? '') &&
        (l.linkDescription ?? '') === (linkDescription ?? ''),
    );
    if (!link) {
      throw new Error(
        linkType
          ? `Link from '${source}' to '${destination}' with link type '${linkType}' not found`
          : `Link from '${source}' to '${destination}' not found`,
      );
    }

    const newLinks = sourceCard.metadata?.links.filter(
      (l) =>
        l.cardKey !== destination ||
        l.linkType !== (linkType ?? '') ||
        (l.linkDescription ?? '') !== (linkDescription ?? ''),
    );

    await this.project.updateCardMetadataKey(source, 'links', newLinks);
  }

  // Removes external link from project.
  private async removeExternalLink(
    cardKey: string,
    externalItem: string,
    direction: 'outbound' | 'inbound',
    linkType?: string,
    linkDescription?: string,
  ) {
    // Parse connector:itemKey
    const [connector, ...rest] = externalItem.split(':');
    const externalItemKey = rest.join(':');

    if (!connector || !externalItemKey) {
      throw new Error(
        `Invalid external item format: '${externalItem}'. Expected 'connector:itemKey'.`,
      );
    }

    const card = this.project.findCard(cardKey);

    const matches = (l: ExternalLink) =>
      l.connector === connector &&
      l.externalItemKey === externalItemKey &&
      l.direction === direction &&
      (!linkType || l.linkType === linkType) &&
      (!linkDescription || l.linkDescription === linkDescription);

    const extLink = card.metadata?.externalLinks?.find(matches);

    if (!extLink) {
      throw new Error(
        `External link from '${cardKey}' to '${connector}:${externalItemKey}' ${linkType ? `with link type '${linkType}' ` : ''}not found`,
      );
    }

    const newExternalLinks: ExternalLink[] =
      card.metadata?.externalLinks?.filter((l) => !matches(l)) ?? [];

    await this.project.updateCardMetadataKey(
      cardKey,
      'externalLinks',
      newExternalLinks,
    );
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
  @write((type, targetName) => `Remove ${type} ${targetName}`)
  public async remove(
    type: RemovableResourceTypes,
    targetName: string,
    ...rest: any[] // eslint-disable-line @typescript-eslint/no-explicit-any
  ) {
    // Ensure module list is up to date when removing modules
    if (type === 'module') {
      await this.fetchCmd.ensureModuleListUpToDate();
    }

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
        return this.removeLink(
          targetName,
          rest.at(0),
          rest.at(1),
          rest.at(2),
          rest.at(3),
        );
      else if (type === 'module')
        return this.moduleManager.removeModule(targetName);
    }
    throw new Error(`Unknown resource type '${type}'`);
  }
}
