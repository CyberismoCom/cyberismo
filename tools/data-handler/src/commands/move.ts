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
import type { Project } from '../containers/project.js';
import type { CardTree, RankChange } from '../containers/project/card-tree.js';
import { write } from '../utils/rw-lock.js';

import { ROOT } from '../utils/constants.js';

export class Move {
  constructor(private project: Project) {}

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

    const sourceTree = this.project.treeOf(source);
    const sourceCard = sourceTree.card(source);
    const sourceIsTemplate = sourceTree.name !== 'project';

    const movingToRoot =
      destination === ROOT || destination.startsWith('root:');
    let targetTemplateName: string | undefined;
    let movingToProjectRoot = false;

    if (movingToRoot) {
      if (destination === ROOT) {
        // Bare 'root' means the root of the card's own container.
        if (sourceIsTemplate) {
          targetTemplateName = sourceTree.name;
        } else {
          movingToProjectRoot = true;
        }
      } else if (destination === 'root:project') {
        movingToProjectRoot = true;
      } else {
        targetTemplateName = destination.slice('root:'.length);
      }
    }

    const destinationTree = movingToRoot
      ? undefined
      : this.project.treeOf(destination);

    // Prevent moving card to inside its descendants
    if (destinationTree?.ancestorsOf(destination).includes(source)) {
      throw new Error(`Card cannot be moved to inside itself`);
    }

    // Imported templates cannot be modified.
    if (!sourceTree.writable || destinationTree?.writable === false) {
      throw new Error(`Cannot modify imported module templates`);
    }

    // Resolve the target template (when moving to a template root). Reject if
    // the resolved template belongs to an imported module — those are
    // read-only.
    let targetTemplateTree: CardTree | undefined;
    if (targetTemplateName) {
      const template = this.project.templateResource(targetTemplateName);
      if (!template) {
        throw new Error(
          `Template ${targetTemplateName} not found in this project`,
        );
      }
      targetTemplateTree = template.cardTree;
      if (!targetTemplateTree.writable) {
        throw new Error(`Cannot modify imported module templates`);
      }
    }

    const destIsProject =
      movingToProjectRoot ||
      (destinationTree !== undefined && destinationTree.name === 'project');
    const destIsTemplate =
      targetTemplateName !== undefined ||
      (destinationTree !== undefined && destinationTree.name !== 'project');
    if (
      (sourceIsTemplate && destIsProject) ||
      (!sourceIsTemplate && destIsTemplate)
    ) {
      throw new Error(
        `Cards cannot be moved from project to template or vice versa`,
      );
    }

    const targetTree =
      targetTemplateTree ?? destinationTree ?? this.project.cardTree;
    const newParent = movingToRoot ? ROOT : destination;
    const destinationPath = targetTree.pathFor(newParent, source);

    // if the card is already in the destination, do nothing
    if (sourceCard.path === destinationPath) {
      return;
    }

    // make sure source card can be moved
    const actionGuard = new ActionGuard(this.project.calculationEngine);
    await actionGuard.checkPermission('move', source);

    // The card lands last in its new location. Taken before the structure
    // update, so the card being moved is not one of the siblings it is ranked
    // against.
    const [rank] = targetTree.rankBlock(newParent, 1);

    // The rank is persisted before the rename: a card at its destination has
    // its destination rank, so a retry completes the move.
    await this.project.updateCardMetadataKey(source, 'rank', rank);

    await this.project.relocateCard(source, newParent, targetTree.name);
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
    // Same tree and same parent: a rank only orders siblings, and two cards
    // in different containers are never siblings even when both sit at 'root'.
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
