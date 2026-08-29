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
import { dirname } from 'node:path';
import { mkdir, rename, rmdir } from 'node:fs/promises';

import { ActionGuard } from '../permissions/action-guard.js';
import { copyDir, deleteDir } from '../utils/file-utils.js';
import type { CardTree, RankChange } from '../containers/project/card-tree.js';
import type { Project } from '../containers/project.js';
import { write } from '../utils/rw-lock.js';

import { ROOT } from '../utils/constants.js';

export class Move {
  constructor(private project: Project) {}

  // Moves a card's folder, and with it every descendant and every attachment
  // under it, to where the card is going.
  //
  // One rename. The bytes do not move - only the folder's directory entry
  // does - so a card with a hundred descendants costs exactly what a single
  // card costs, and this step is atomic: there is no window in which the
  // subtree exists twice or not at all. What it replaces was a hand-rolled
  // recursive copy followed by a recursive delete, which read and wrote every
  // byte of every card, and failed *unsafe*: a delete that failed after the
  // copy had succeeded left the whole subtree duplicated in two places.
  //
  // rename cannot cross filesystems. A card root that spans a mount point is
  // the only way to see EXDEV, and there copying is the only thing left to
  // do.
  // @param from The card's current folder.
  // @param to Where the folder is going.
  // @param vacatedChildFolder The 'c' folder the card is leaving, if it is
  //   leaving another card's children. Removed when the card was the last
  //   one in it.
  private async relocateFolder(
    from: string,
    to: string,
    vacatedChildFolder?: string,
  ) {
    // Moving a card into another card creates that card's 'c' folder: the
    // destination's parent folder need not exist yet.
    await mkdir(dirname(to), { recursive: true });
    try {
      await rename(from, to);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EXDEV') {
        throw error;
      }
      await copyDir(from, to);
      await deleteDir(from);
    }

    if (vacatedChildFolder) {
      // A 'c' folder with no cards left in it is not part of the tree, and
      // leaving it behind made every move of an only child leave a stray
      // empty folder in the repository. rmdir refuses to remove a folder that
      // still holds anything, which is exactly the condition wanted here.
      await rmdir(vacatedChildFolder).catch(() => {});
    }
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

    // Which tree the card is in answers everything the card's path used to be
    // sniffed for: whether it is a template card ('project' or a template's
    // name), and whether it may be written at all (a module's tree is not
    // writable). The tree knows; the filesystem does not have to be asked.
    const sourceTree = this.project.treeOf(source);
    // The node view: a move needs the card's position, not its content.
    const sourceCard = sourceTree.node(source);
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
    const destinationCard = destinationTree?.node(destination);

    // Prevent moving card to inside its descendants
    if (
      destinationCard &&
      destinationTree!.ancestorsOf(destinationCard.key).includes(source)
    ) {
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

    // The tree the card lands in, and where in it. The destination folder is
    // the tree's own answer to "where would a child of this parent live",
    // which is the same rule it derives every other card path with.
    const targetTree =
      targetTemplateTree ?? destinationTree ?? this.project.cardTree;
    const newParent = movingToRoot ? ROOT : destination;
    const destinationPath = targetTree.pathFor(newParent, source);

    // The card is already where it is going, and its rank was persisted
    // before it got there (see below), so there is nothing left to do.
    if (sourceCard.path === destinationPath) {
      return;
    }

    // make sure source card can be moved
    const actionGuard = new ActionGuard(this.project.calculationEngine);
    await actionGuard.checkPermission('move', source);

    // The card lands last in its new location. Taken before the structure
    // update, so the card being moved is not one of the siblings it is
    // ranked against.
    const [rank] = targetTree.rankBlock(newParent, 1);

    // The rank goes first, into the folder that is about to be renamed: the
    // metadata file travels with the folder, so a card that has arrived at
    // its destination has its destination rank. That is what makes a retry
    // finish the move.
    //
    // Only the rename is atomic; the move as a whole is not, and does not try
    // to be. What it is instead is ordered, so that every state a failure can
    // leave behind is one a retry of the same move completes: a failed rank
    // write leaves the card where it was, to be moved by the retry, and a
    // failed rename leaves it there with the rank it will hold once it
    // arrives. The reverse order - rename, then rank - had no such state: the
    // rename committed the move and a failed rank write left the card in its
    // new place holding a rank from the sibling set it had left, where a
    // retry returned early on 'already at the destination' and never repaired
    // it.
    await this.project.updateCardMetadataKey(source, 'rank', rank);

    await this.relocateFolder(
      sourceCard.path,
      destinationPath,
      // The folder the card is leaving behind, when it is leaving another
      // card's children rather than a container root.
      sourceCard.parent && sourceCard.parent !== ROOT
        ? dirname(sourceCard.path)
        : undefined,
    );

    // One edge update is the whole structure change: the tree derives paths
    // from its edges, so every descendant and every attachment of the moved
    // card follows it without being rewritten.
    this.project.relocateCard(source, newParent, targetTree.name);
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
