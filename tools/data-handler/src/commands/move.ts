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
import { join } from 'node:path';

import { ActionGuard } from '../permissions/action-guard.js';
import { copyDir, deleteDir } from '../utils/file-utils.js';
import type { Project } from '../containers/project.js';
import type { RankChange } from '../containers/project/card-tree.js';
import { write } from '../utils/rw-lock.js';
import {
  isModuleCard,
  isModulePath,
  isTemplateCard,
} from '../utils/card-utils.js';

import { ROOT } from '../utils/constants.js';

export class Move {
  constructor(private project: Project) {}

  // The container a card belongs to: 'project', or a template's full name.
  private containerOf(cardKey: string): string {
    return this.project.treeOf(cardKey).name;
  }

  // Whether a card is one of the project's own, as opposed to a template's.
  private isProjectCard(cardKey: string): boolean {
    return this.containerOf(cardKey) === 'project';
  }

  // The template a template card belongs to.
  private templateOf(cardKey: string): string {
    const container = this.containerOf(cardKey);
    if (container === 'project') {
      throw new Error(`Card '${cardKey}' is not part of a template`);
    }
    return container;
  }

  // Persists the ranks a tree computed, in the order it gave them.
  private async applyRanks(changes: RankChange[]) {
    for (const change of changes) {
      await this.project.updateCardMetadataKey(
        change.cardKey,
        'rank',
        change.rank,
      );
    }
  }

  /**
   * Moves card from 'destination' to 'source'.
   * @param source source card to move
   * @param destination destination card where source card will be moved to; or to root
   */
  @write((source, destination) => `Move card ${source} to ${destination}`)
  public async moveCard(source: string, destination: string) {
    if (source === ROOT) {
      throw new Error('Cannot move "root"');
    }
    if (source === destination) {
      throw new Error(`Card cannot be moved to itself`);
    }

    const sourceCard = this.project.findCard(source);
    const movingToRoot =
      destination === ROOT || destination.startsWith('root:');
    let targetTemplateName: string | undefined;
    let movingToProjectRoot = false;

    if (movingToRoot) {
      if (destination === ROOT) {
        if (isTemplateCard(sourceCard)) {
          targetTemplateName = this.templateOf(sourceCard.key);
        } else {
          movingToProjectRoot = true;
        }
      } else if (destination === 'root:project') {
        movingToProjectRoot = true;
      } else {
        targetTemplateName = destination.slice('root:'.length);
      }
    }

    const destinationCard = !movingToRoot
      ? this.project.findCard(destination)
      : undefined;

    // Prevent moving card to inside its descendants
    if (
      destinationCard &&
      this.project
        .treeOf(destinationCard.key)
        .ancestorsOf(destinationCard.key)
        .includes(source)
    ) {
      throw new Error(`Card cannot be moved to inside itself`);
    }

    // Imported templates cannot be modified.
    if (
      (destinationCard && isModuleCard(destinationCard)) ||
      isModuleCard(sourceCard)
    ) {
      throw new Error(`Cannot modify imported module templates`);
    }

    // Resolve the target template (when moving to a template root) and its
    // cards folder. Reject if the resolved template belongs to an imported
    // module — those are read-only.
    let templateCardsFolder: string | undefined;
    if (targetTemplateName) {
      const template = this.project.templateResource(targetTemplateName);
      if (!template) {
        throw new Error(
          `Template ${targetTemplateName} not found in this project`,
        );
      }
      templateCardsFolder = template.templateCardsFolder();
      if (isModulePath(templateCardsFolder)) {
        throw new Error(`Cannot modify imported module templates`);
      }
    }

    const sourceIsTemplate = isTemplateCard(sourceCard);
    const destIsProject =
      movingToProjectRoot ||
      (destinationCard !== undefined && !isTemplateCard(destinationCard));
    const destIsTemplate =
      targetTemplateName !== undefined ||
      (destinationCard !== undefined && isTemplateCard(destinationCard));
    if (
      (sourceIsTemplate && destIsProject) ||
      (!sourceIsTemplate && destIsTemplate)
    ) {
      throw new Error(
        `Cards cannot be moved from project to template or vice versa`,
      );
    }

    // Which container the card lands in: the template the sentinel named, the
    // project root, or whatever container the destination card is in.
    const destinationContainer = movingToRoot
      ? (targetTemplateName ?? 'project')
      : this.containerOf(destination);

    const destinationPath = movingToRoot
      ? movingToProjectRoot
        ? join(this.project.paths.cardRootFolder, sourceCard.key)
        : join(templateCardsFolder!, sourceCard.key)
      : join(destinationCard!.path, 'c', sourceCard.key);

    // if the card is already in the destination, do nothing
    if (sourceCard.path === destinationPath) {
      return;
    }

    // make sure source card can be moved
    const actionGuard = new ActionGuard(this.project.calculationEngine);
    await actionGuard.checkPermission('move', source);

    // The card lands last in its new location. Taken before the structure
    // update, so the card being moved is not one of the siblings it is
    // ranked against.
    const [rank] = this.project
      .containerTree(destinationContainer)
      .rankBlock(movingToRoot ? ROOT : destination, 1);

    // First do the file operations, then the tree position
    await copyDir(sourceCard.path, destinationPath);
    await deleteDir(sourceCard.path);

    // One edge update is the whole structure change: the tree derives paths
    // from its edges, so every descendant and every attachment of the moved
    // card follows it without being rewritten.
    this.project.relocateCard(
      source,
      movingToRoot ? ROOT : destination,
      destinationContainer,
    );

    // Rank the card in its new place. Persists the metadata to the card's new
    // folder and notifies the calculation engine about the change.
    await this.project.updateCardMetadataKey(source, 'rank', rank);

    // Notify the project about the move (calculation engine tree rebuild)
    await this.project.handleCardMoved(this.project.cardNode(source));
  }

  /**
   * Ranks card using position given as 'index'.
   * @param cardKey card key
   * @param index to which position should card be ranked to
   */
  @write((cardKey) => `Reorder card ${cardKey}`)
  public async rankByIndex(cardKey: string, index: number) {
    if (index < 0) {
      throw new Error(`Index must be greater than 0`);
    }
    if (index === 0) {
      await this.rankFirst(cardKey);
      return;
    }

    const siblings = this.project.treeOf(cardKey).siblingsOf(cardKey);
    if (siblings.length < index) {
      throw new Error(`Index ${index} is out of bounds`);
    }
    await this.rankCard(cardKey, siblings[index - 1]);
  }

  /**
   * Sets the rank of a card to be after another card.
   * @param cardKey Card to rank
   * @param beforeCardKey Card key after which the card will be ranked
   */
  @write((cardKey) => `Reorder card ${cardKey}`)
  public async rankCard(cardKey: string, beforeCardKey: string) {
    if (cardKey === beforeCardKey) {
      throw new Error(`Card cannot be ranked after itself`);
    }

    const tree = this.project.treeOf(cardKey);
    // Same tree and same parent: ranks only order siblings, and two cards in
    // different containers are never siblings even when both sit at 'root'.
    if (
      tree !== this.project.treeOf(beforeCardKey) ||
      tree.node(beforeCardKey).parent !== tree.node(cardKey).parent
    ) {
      throw new Error(`Cards must be from the same parent`);
    }

    await this.applyRanks(tree.rankAfter(cardKey, beforeCardKey));
  }

  /**
   * Ranks card first.
   * @param cardKey card key
   */
  @write((cardKey) => `Rank card ${cardKey} first`)
  public async rankFirst(cardKey: string) {
    await this.applyRanks(this.project.treeOf(cardKey).rankFirst(cardKey));
  }

  /**
   *  Rebalances the ranks of the children of a card.
   * @param parentCardKey parent card key
   */
  @write((parentCardKey) => `Rebalance children of ${parentCardKey}`)
  public async rebalanceChildren(parentCardKey: string) {
    await this.applyRanks(
      this.project.treeOf(parentCardKey).rebalanceUnder(parentCardKey),
    );
  }

  /**
   * Rebalances the ranks of the cards in the whole project, including templates
   * Can be used even if the ranks do not exist
   */
  @write(() => 'Rebalance project')
  public async rebalanceProject() {
    // Every tree, level by level. A module's tree refuses writes, so there is
    // nothing to rebalance in it.
    for (const tree of [
      this.project.cardTree,
      ...this.project.templateTrees(),
    ]) {
      if (tree.writable) {
        await this.applyRanks(tree.rebalanceSubtree(ROOT));
      }
    }
  }
}
