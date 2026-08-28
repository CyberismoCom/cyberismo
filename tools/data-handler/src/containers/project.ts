/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

// node
import { join, resolve } from 'node:path';
import { readdirSync } from 'node:fs';

// base class
import { CardContainer } from './card-container.js';

import { CalculationEngine } from './project/calculation-engine.js';
import { CardKeyRegistry } from './project/card-keys.js';
import { CardTree } from './project/card-tree.js';
import {
  CardNotFoundError,
  DuplicateCardKeyError,
} from '../exceptions/index.js';
import {
  type Card,
  type CardAttachment,
  CardLocation,
  type CardListContainer,
  type CardMetadata,
  type CardNode,
  type MetadataContent,
  type ModuleContent,
} from '../interfaces/project-interfaces.js';
import { pathExists } from '../utils/file-utils.js';
import { isModulePath } from '../utils/card-utils.js';
import type { CardFactContext } from '../utils/clingo-facts.js';
import { ActionGuard } from '../permissions/action-guard.js';
import { applySideEffects, type SideEffects } from '../side-effects.js';
import { ProjectConfiguration } from '../project-settings.js';
import { resourceName } from '../utils/resource-utils.js';
import { ProjectPaths } from './project/project-paths.js';
import { readCardsConfig } from './project/cards-config.js';
import { ResourceHandler } from './project/resource-handler.js';
import { Validate } from '../commands/validate.js';
import { ContentWatcher } from './project/project-content-watcher.js';
import { getChildLogger } from '../utils/log-utils.js';
import { RWLock } from '../utils/rw-lock.js';
import { GitSync } from '../utils/git-sync.js';
import { GitManager } from '../utils/git-manager.js';
import { getCommitContext } from '../utils/commit-context.js';

import type { Template } from './template.js';

import { isPredefinedField } from '../utils/constants.js';

/**
 * Options for Project initialization. All default to off.
 *
 * watchResourceChanges - Project refreshes automatically on filesystem
 *   changes in `.cards`. Unrelated to git.
 * autocommit - Make writes git transactions: commit after a successful write,
 *   roll back to the last commit after a failed one.
 * autopush - Also push each autocommit to the remote, in the background.
 *   Requires autocommit; see the note in the constructor.
 */
export interface ProjectOptions {
  watchResourceChanges?: boolean;
  autocommit?: boolean;
  autopush?: boolean;
}

/**
 * Represents project folder.
 */
export class Project extends CardContainer {
  public readonly lock = new RWLock();
  public calculationEngine: CalculationEngine;
  // The project's own cards.
  private projectCardTree: CardTree;
  // One tree per template, kept here rather than on the TemplateResource: a
  // resource instance is dropped and rebuilt on every resources.changed(),
  // and the cards must outlive that.
  private templateCardTrees: Map<string, CardTree> = new Map();
  private keyRegistry: CardKeyRegistry;
  private gitManager: GitManager;
  private readonly gitSync: GitSync;
  private logger = getChildLogger({ module: 'Project' });
  private projectPaths: ProjectPaths;
  private resourceHandler: ResourceHandler;
  private resourceWatcher: ContentWatcher | undefined;
  private settings: ProjectConfiguration;
  private validator: Validate;
  private cachedAllModulePrefixes: string[] = [];

  constructor(
    path: string,
    private options: ProjectOptions = {
      watchResourceChanges: false,
    },
  ) {
    const settings = new ProjectConfiguration(
      join(path, '.cards', 'local', Project.projectConfigFileName),
    );
    // Card keys are unique across the project and every one of its templates,
    // so the registry is built before any tree and shared by all of them. It
    // reads the prefix through a function because a project rename changes it.
    const keys = new CardKeyRegistry(() => settings.cardKeyPrefix);
    super(path, settings.cardKeyPrefix);
    this.settings = settings;
    this.keyRegistry = keys;
    this.projectCardTree = new CardTree({
      name: 'project',
      rootPath: join(path, 'cardRoot'),
      writable: true,
      emitsCardFact: true,
      validationApplies: true,
      keys,
    });

    // Pushing only makes sense for commits this process makes, and both
    // autopush call sites sit inside the autocommit branch below, so autopush
    // on its own would be inert. Normalised here rather than at each entry
    // point, so the CLI and the server cannot disagree about it.
    this.options.autopush = this.options.autocommit && this.options.autopush;

    this.logger.info({ path }, 'Initializing project');

    this.calculationEngine = new CalculationEngine(this);
    this.projectPaths = new ProjectPaths(path);
    this.resourceHandler = new ResourceHandler(this);
    // todo: implement project validation
    this.validator = Validate.getInstance();

    this.logger.info(
      { name: this.settings.name },
      'Project initialization complete',
    );

    this.refreshAllModulePrefixes();

    const ignoreRenameFileChanges = true;

    // Watch changes in .cards if there are multiple instances of Project being
    // run concurrently.
    if (this.options.watchResourceChanges) {
      this.resourceWatcher = new ContentWatcher(
        ignoreRenameFileChanges,
        this.paths.resourcesFolder,
        (fileName: string) => {
          void (async () => {
            this.resources.handleFileSystemChange(
              join(this.paths.resourcesFolder, fileName),
            );
            this.resources.changed();
          })();
        },
      );
    }

    this.gitManager = new GitManager(path);

    // Regenerate Clingo facts after every write transaction so that
    // metadata-only edits (e.g. title changes) are immediately visible.
    this.lock.onAfterWrite(async () => {
      await this.calculationEngine.generate();
    });

    this.gitSync = new GitSync(this.gitManager);

    if (this.options.autocommit) {
      // Commit after successful writes
      this.lock.onAfterWrite(async () => {
        const context = getCommitContext();
        await this.gitManager.commit(
          context.message ?? 'Autocommit',
          context.author,
        );
        if (this.options.autopush) void this.gitSync.push();
      });

      // Rollback on failed writes
      this.lock.onWriteError(async () => {
        await this.gitManager.rollback();
        // Invalidate caches after rollback since filesystem state changed
        this.cardTree.clear();
        await this.populateCardsCache();
        this.resources.changed();
        await this.calculationEngine.generate();
      });
    }
  }

  /** The tree holding the project's own cards. */
  protected get cardTree(): CardTree {
    return this.projectCardTree;
  }

  /**
   * The project's card key registry: who owns every key, and where new ones
   * come from.
   */
  public get cardKeyRegistry(): CardKeyRegistry {
    return this.keyRegistry;
  }

  /**
   * The tree holding one template's cards.
   *
   * Created on first use. A tree that has not been loaded holds no cards, and
   * reads of it answer 'none' — which is what a template with no cards on disk
   * answers too.
   * @param templateName Full name of the template.
   * @param cardsFolder The template's 'c' folder. Only needed the first time,
   *   and when the folder has moved.
   */
  public templateTree(templateName: string, cardsFolder?: string): CardTree {
    const known = this.templateCardTrees.get(templateName);
    if (known) {
      if (cardsFolder && resolve(cardsFolder) !== resolve(known.rootPath)) {
        known.rebase(templateName, cardsFolder);
      }
      return known;
    }
    const rootPath = cardsFolder ?? this.templateCardsFolder(templateName);
    const tree = new CardTree({
      name: templateName,
      rootPath,
      // A module's cards are read-only. The tree is where that is enforced.
      writable: !isModulePath(rootPath),
      // Template cards get no card() fact, which is what makes them invisible
      // to queries, and their metadata is not validated: a template card
      // carries an empty workflow state by construction.
      emitsCardFact: false,
      validationApplies: false,
      keys: this.keyRegistry,
    });
    this.templateCardTrees.set(templateName, tree);
    return tree;
  }

  /**
   * Every template tree the project knows about.
   */
  public templateTrees(): CardTree[] {
    return [...this.templateCardTrees.values()];
  }

  /**
   * The tree that holds a card.
   * @param cardKey Card key to look up.
   * @throws CardNotFoundError if no tree holds the card
   */
  public treeOf(cardKey: string): CardTree {
    const tree = this.keyRegistry.ownerOf(cardKey);
    if (!tree) {
      throw new CardNotFoundError(cardKey);
    }
    return tree;
  }

  /**
   * Moves a template's tree to a new name and folder, after the template has
   * been renamed on disk.
   *
   * No reload: card paths are derived, so the cards the tree holds are already
   * correct.
   * @param oldName Template's previous full name.
   * @param newName Template's new full name.
   * @param cardsFolder The template's 'c' folder, after the rename.
   */
  public renameTemplateTree(
    oldName: string,
    newName: string,
    cardsFolder: string,
  ) {
    const tree = this.templateCardTrees.get(oldName);
    if (!tree) {
      this.templateTree(newName, cardsFolder);
      return;
    }
    // A tree may already have been created under the new name by a read that
    // ran between the folder rename and this call; it is empty, and the cards
    // are in the tree being renamed.
    this.templateCardTrees.get(newName)?.clear();
    this.templateCardTrees.delete(oldName);
    tree.rebase(newName, cardsFolder);
    this.templateCardTrees.set(newName, tree);
  }

  /**
   * Drops a template's tree, e.g. when the template is deleted.
   * @param templateName Full name of the template.
   */
  public removeTemplateTree(templateName: string) {
    this.templateCardTrees.get(templateName)?.clear();
    this.templateCardTrees.delete(templateName);
  }

  /**
   * The tree of one container.
   * @param container 'project', or a full template name.
   */
  public containerTree(container: string): CardTree {
    return container === 'project'
      ? this.cardTree
      : this.templateTree(container);
  }

  // The 'c' folder of a template, resolved through its resource.
  private templateCardsFolder(templateName: string): string {
    const template = this.templateObjectByName(templateName);
    return template ? template.templateCardsFolder() : '';
  }

  // Finds specific module.
  private async findModule(
    moduleName: string,
  ): Promise<{ name: string; path: string } | undefined> {
    const moduleExists = this.resources.moduleNames().includes(moduleName);
    if (!moduleExists) {
      return undefined;
    }

    // For modules, we need to construct the local path where the module is stored
    const moduleConfig = this.configuration.modules?.find(
      (module) => module.name === moduleName,
    );
    if (!moduleConfig) {
      return undefined;
    }

    return {
      name: moduleName,
      path: join(this.paths.modulesFolder, moduleConfig.name),
    };
  }

  // Refreshes the cached list of all module prefixes.
  // This includes both direct and transient module dependencies.
  private refreshAllModulePrefixes(): void {
    const prefixes: string[] = [this.projectPrefix];

    try {
      const modules = readdirSync(this.paths.modulesFolder, {
        withFileTypes: true,
      })
        .filter((item) => item.isDirectory())
        .map((item) => item.name);

      prefixes.push(...modules);
    } catch {
      // If modules folder doesn't exist, fall back to configuration modules only
      const moduleNames = this.configuration.modules.map((item) => item.name);
      prefixes.push(...moduleNames);
    }

    this.cachedAllModulePrefixes = prefixes;
  }

  // Validates that card's data is valid.
  private async validateCard(card: Card): Promise<string> {
    const invalidCustomData = await this.validator.validateCustomFields(
      this,
      card,
      this.allModulePrefixes(),
    );
    const invalidWorkFlow = await this.validator.validateWorkflowState(
      this,
      card,
    );

    const invalidLabels = this.validator.validateCardLabels(card);
    if (
      invalidCustomData.length === 0 &&
      invalidWorkFlow.length === 0 &&
      invalidLabels.length === 0
    ) {
      return '';
    }
    const errors: string[] = [];
    if (invalidCustomData.length > 0) {
      errors.push(invalidCustomData);
    }
    if (invalidWorkFlow.length > 0) {
      errors.push(invalidWorkFlow);
    }
    if (invalidLabels.length > 0) {
      errors.push(invalidLabels);
    }
    return errors.join('\n');
  }

  /**
   * Populate template cards into the card cache.
   */
  protected async populateTemplateCards(
    templateNames?: string[],
  ): Promise<void> {
    try {
      const templates = this.resources
        .templates()
        .map((template) => template.templateObject())
        .filter(
          (template) =>
            !templateNames || templateNames.includes(template.fullName),
        );

      // Templates that no longer exist keep no cards. Their trees are dropped
      // rather than reloaded: a module removal takes its templates with it.
      const present = new Set(templates.map((template) => template.fullName));
      for (const name of this.templateCardTrees.keys()) {
        if (!templateNames && !present.has(name)) {
          this.removeTemplateTree(name);
        }
      }

      await Promise.all(
        templates.map((template) =>
          this.templateTree(
            template.fullName,
            template.templateCardsFolder(),
          ).reload(),
        ),
      );
    } catch (error) {
      // A duplicate card key is a defect in the project, not a broken
      // template that can be skipped: with two cards claiming one key the
      // cache cannot represent both, so the caller has to hear about it.
      if (error instanceof DuplicateCardKeyError) {
        throw error;
      }
      this.logger.error(
        { error },
        'Failed to populate template cards into the card cache',
      );
    }
  }

  /**
   * Populate both the project cards, and all template cards into card cache.
   */
  protected async populateCardsCache(): Promise<void> {
    await this.cardTree.reload();
    await this.populateTemplateCards();
  }

  /**
   * Drops every card the project holds, so that the next populate reads them
   * all from disk again.
   *
   * Needed when the cards on disk change under the project: a prefix rename
   * rewrites them raw, a module replay swaps whole template folders, and a git
   * rollback puts back a different revision.
   */
  public clearCards(): void {
    this.cardTree.clear();
    for (const tree of this.templateTrees()) {
      tree.clear();
    }
  }

  /**
   * Returns all template cards from the project. This includes all module templates' cards.
   * @returns all the template cards from the project
   */
  public allTemplateCards(): Card[] {
    return this.templateTrees().flatMap((tree) => tree.cards());
  }

  /**
   * Returns an array of all the attachments in the project card's (excluding ones in templates).
   * @returns all attachments in the project.
   */
  public attachments(): CardAttachment[] {
    return this.cardTree.attachments();
  }

  /**
   * Returns the attachments of a single template's cards.
   * @param templateName Full name of the template.
   * @returns Array of attachments from the template's cards
   */
  public templateAttachments(templateName: string): CardAttachment[] {
    return this.templateTree(templateName).attachments();
  }

  /**
   * Returns path to a card's attachment folder.
   * @param cardKey card key
   * @returns path to a card's attachment folder.
   */
  public cardAttachmentFolder(cardKey: string): string {
    return this.treeOf(cardKey).attachmentFolderOf(cardKey);
  }

  /**
   * Creates an attachment for a card.
   * @param cardKey The card to add attachment to
   * @param attachmentName The name for the attachment file
   * @param attachmentData The attachment data (file path or buffer)
   * @throws If trying to add attachment to module card, or if attachment is not found
   */
  public async createCardAttachment(
    cardKey: string,
    attachmentName: string,
    attachmentData: string | Buffer,
  ): Promise<void> {
    await this.treeOf(cardKey).addAttachment(
      cardKey,
      attachmentName,
      attachmentData,
    );
  }

  /**
   * Returns path to a card's folder.
   * @param cardKey card key
   * @returns path to a card's folder.
   */
  public async cardFolder(cardKey: string): Promise<string> {
    return this.keyRegistry.has(cardKey)
      ? this.treeOf(cardKey).pathOf(cardKey)
      : '';
  }

  /**
   * Fetches full Card data for given card keys
   * @param cardIds array of card keys to fetch
   * @returns Card data to the given card keys
   */
  public cardKeysToCards(cardIds: string[]): Card[] {
    const cards: Card[] = [];
    for (const cardKey of cardIds) {
      const tree = this.keyRegistry.ownerOf(cardKey);
      if (tree) {
        cards.push(tree.card(cardKey));
      }
    }
    return cards;
  }

  /**
   * Returns an array of all the cards in the project, fully hydrated.
   * @note These are project cards only, by default (unless path dictates otherwise).
   * @note Prefer cardNodes() when the content and the attachment listing are
   *   not needed.
   * @param path Path from which to fetch the cards. Generally it is best to fetch from Project root, e.g. Project.cardRootFolder
   * @returns all cards from the given path in the project.
   */
  public cards(path?: string): Card[] {
    Project.assertCardRoot(this, path);
    return this.cardTree.cards();
  }

  // The card-root path callers still pass to the project-card reads. It has
  // never selected anything - the project's cards are the project tree's - and
  // it goes when these delegations do.
  private static assertCardRoot(project: Project, path?: string) {
    if (path && resolve(path) !== resolve(project.paths.cardRootFolder)) {
      throw new Error(
        `Project card reads are rooted at the card root, not '${path}'`,
      );
    }
  }

  /**
   * Metadata-level view of every card at the given path: identity, tree
   * position and metadata, without the content or the attachment listing.
   * @param path Path from which to fetch the cards.
   * @returns nodes of all cards from the given path in the project.
   */
  public cardNodes(path?: string): CardNode[] {
    Project.assertCardRoot(this, path);
    return this.cardTree.nodes();
  }

  /**
   * Card keys of every card at the given path.
   * @param path Path from which to fetch the keys.
   * @returns keys of all cards from the given path in the project.
   */
  public cardKeys(path?: string): string[] {
    Project.assertCardRoot(this, path);
    return this.cardTree.keys();
  }

  /**
   * Metadata-level view of one card: identity, tree position and metadata,
   * without the content or the attachment listing.
   * @param cardKey Card key to read.
   * @throws if the card is not part of the project
   */
  public cardNode(cardKey: string): CardNode {
    return this.treeOf(cardKey).node(cardKey);
  }

  /**
   * Content of one card.
   * @param cardKey Card key to read.
   * @returns the card's content, or undefined if it has none.
   * @throws if the card is not part of the project
   */
  public cardContent(cardKey: string): string | undefined {
    return this.treeOf(cardKey).content(cardKey);
  }

  /**
   * Attachment listing of one card.
   * @param cardKey Card key to read.
   * @throws if the card is not part of the project
   */
  public cardAttachments(cardKey: string): CardAttachment[] {
    return this.treeOf(cardKey).attachmentsOf(cardKey);
  }

  /**
   * Returns project configuration.
   * @returns project configuration.
   */
  public get configuration(): ProjectConfiguration {
    return this.settings;
  }

  /**
   * Creates a Template object from template Card. It is ensured that the template is part of project.
   * @param card Card that is part of some template.
   * @returns Template object, or undefined if card is not part of template.
   */
  public createTemplateObjectFromCard(card: Card): Template | undefined {
    const tree = this.keyRegistry.ownerOf(card?.key);
    if (!tree || tree === this.cardTree) {
      return undefined;
    }
    return this.templateObjectByName(tree.name);
  }

  /**
   * Looks up a template object by its resource name.
   * @param templateName Full resource name in the form `<prefix>/templates/<name>`
   *   (e.g. 'decision/templates/decision').
   * @returns Template object, or undefined if not found.
   */
  public templateObjectByName(templateName: string): Template | undefined {
    try {
      return this.resources.byType(templateName, 'templates').templateObject();
    } catch {
      return undefined;
    }
  }

  /**
   * Cleanups project when it is being closed.
   */
  public dispose() {
    if (this.resourceWatcher) {
      this.resourceWatcher.close();
      this.resourceWatcher = undefined;
    }
  }

  /**
   * Returns specific card.
   * @param cardToFind Card key to find
   * @returns specific card details, or undefined if card is not part of the project.
   */
  public findCard(cardToFind: string): Card {
    return this.treeOf(cardToFind).card(cardToFind);
  }

  /**
   * Checks if the project holds the card, in its own cards or in a template's.
   * @param cardKey Card key to check
   */
  public hasCard(cardKey: string): boolean {
    return this.keyRegistry.has(cardKey);
  }

  /**
   * Checks if the project holds the card as one of its own cards.
   * @param cardKey Card key to check
   */
  public hasProjectCard(cardKey: string): boolean {
    return this.keyRegistry.ownerOf(cardKey) === this.cardTree;
  }

  /**
   * Checks if the project holds the card as a template card.
   * @param cardKey Card key to check
   */
  public hasTemplateCard(cardKey: string): boolean {
    const tree = this.keyRegistry.ownerOf(cardKey);
    return tree !== undefined && tree !== this.cardTree;
  }

  /**
   * Finds root of a project
   * @param path Path where to start looking for the project root.
   * @returns path to a project root, or empty string.
   */
  public static async findProjectRoot(path: string): Promise<string> {
    const currentPath = resolve(join(path, '.cards'));
    if (pathExists(currentPath)) {
      return path;
    }

    const parentPath = resolve(path, '..');
    if (parentPath === path) {
      return '';
    }

    return Project.findProjectRoot(parentPath);
  }

  /**
   * The location a card belongs to.
   * @param cardKey Card key to look up.
   * @returns 'project', a full template name, or undefined if the card is not
   *   part of the project.
   */
  public locationOfCard(cardKey: string): string | undefined {
    return this.keyRegistry.ownerOf(cardKey)?.name;
  }

  /**
   * The keys of a card's ancestors, nearest first.
   * @param cardKey Card key whose ancestors to return.
   */
  public ancestorsOf(cardKey: string): string[] {
    return this.treeOf(cardKey).ancestorsOf(cardKey);
  }

  // Card writes go to the tree that holds the card: a template card is
  // written by its template's tree, not the project's.
  protected async saveCardContent(card: Card): Promise<boolean> {
    return this.treeOf(card.key).writeContent(card);
  }

  protected async saveCardMetadata(card: Card): Promise<boolean> {
    return this.treeOf(card.key).writeMetadata(card);
  }

  protected async removeCard(cardKey: string): Promise<boolean> {
    return this.treeOf(cardKey).deleteSubtree(cardKey);
  }

  /**
   * When card changes.
   * @param changedCard Card that was changed.
   */
  public async handleCardChanged(changedCard: CardNode) {
    // Notify the calculation engine about the change
    return this.calculationEngine.handleCardChanged(changedCard);
  }

  /**
   * When cards are removed.
   * @param deletedCard Card that is to be removed.
   */
  public async handleCardDeleted(deletedCard: Card) {
    // Delete children from the cache first
    if (deletedCard.children && deletedCard.children.length > 0) {
      const parentTree = this.keyRegistry.ownerOf(deletedCard.key);

      for (const child of deletedCard.children) {
        try {
          const childCard = this.findCard(child);
          const childTree = this.keyRegistry.ownerOf(child);

          // Safety check: only delete children from the same container
          if (childTree !== undefined && childTree !== parentTree) {
            const errorMessage =
              `Cannot delete child card '${child}' from different container '${childTree.name}' ` +
              `than parent card '${deletedCard.key}' from '${parentTree?.name}'`;
            this.logger.error(errorMessage);
            throw new Error(errorMessage);
          }

          await this.handleCardDeleted(childCard);
        } catch (error) {
          this.logger.warn(
            { error },
            `Accessing child '${child}' of '${deletedCard.key}' when deleting cards caused an exception`,
          );
          continue;
        }
      }
    }
    await this.removeCard(deletedCard.key);
    return this.calculationEngine.handleDeleteCard(deletedCard);
  }

  /**
   * Deletes the given cards together with their descendant subtrees, and
   * removes any links from surviving cards that point at a deleted card.
   *
   * This is the structural card-deletion primitive shared by the `remove`
   * command and the resource mutation handlers. It performs no permission
   * checks and assumes the caller already holds the write lock.
   * @param cards Root cards to delete. Descendants are removed via cascade, so
   *   passing a card whose ancestor is also in the list is safe.
   */
  public async deleteCards(cards: Card[]) {
    if (cards.length === 0) {
      return;
    }

    // Collect every key that will be removed (each card plus its subtree) so
    // link cleanup can drop links pointing anywhere into the deleted set.
    const deletedKeys = new Set<string>();
    const collectDescendants = (cardKey: string) => {
      if (deletedKeys.has(cardKey)) {
        return;
      }
      let card: Card;
      try {
        card = this.findCard(cardKey);
      } catch {
        this.logger.debug({ cardKey }, 'Card to delete not found, skipping');
        return;
      }
      deletedKeys.add(cardKey);
      for (const childKey of card.children) {
        collectDescendants(childKey);
      }
    };
    for (const card of cards) {
      collectDescendants(card.key);
    }

    // Strip links from surviving cards that point at any card being removed.
    const linkUpdates: Promise<void>[] = [];
    for (const item of this.cardNodes(this.paths.cardRootFolder)) {
      if (deletedKeys.has(item.key) || !item.metadata) {
        continue;
      }
      const links = item.metadata.links;
      const preservedLinks = links.filter((l) => !deletedKeys.has(l.cardKey));
      if (preservedLinks.length !== links.length) {
        linkUpdates.push(
          this.updateCardMetadataKey(item.key, 'links', preservedLinks),
        );
      }
    }
    await Promise.all(linkUpdates);

    // Remove the subtrees. handleCardDeleted cascades children, so any card
    // already removed as part of an earlier subtree is skipped here.
    for (const card of cards) {
      let fresh: Card;
      try {
        fresh = this.findCard(card.key);
      } catch {
        continue;
      }
      await this.handleCardDeleted(fresh);
    }
  }

  /**
   * When card is moved.
   * @param movedCard Card that moved
   * @param newParentCard New parent for the 'movedCard'
   * @param oldParentCard Previous parent of the 'movedCard'
   */
  public async handleCardMoved(movedCard: CardNode) {
    await this.handleCardChanged(movedCard);
    await this.calculationEngine.handleCardMoved();
  }

  /**
   * Moves a card to a new position in the card tree.
   *
   * The tree derives paths from its edges, so this is the whole structure
   * update: the moved card's descendants and their attachments follow it
   * without being touched.
   * @param cardKey Card that moved.
   * @param newParent New parent card key, or 'root'.
   * @param container Container the card now belongs to: 'project' or a full
   *   template name. Defaults to the one it is in.
   */
  public relocateCard(cardKey: string, newParent: string, container?: string) {
    const source = this.treeOf(cardKey);
    const destination =
      container === undefined ? source : this.containerTree(container);
    if (destination === source) {
      source.relocate(cardKey, newParent);
      return;
    }
    // Between two trees the cards themselves move: out of one store and into
    // the other, subtree and all.
    destination.graft(source.uproot(cardKey), newParent);
  }

  /**
   * Adds cards that have just been created on disk to the card tree, and
   * refreshes their facts so a query run afterwards can see them.
   *
   * Storage and fact projection only. The creation query and the side effects
   * it asks for belong to the command that created the cards and holds the
   * write lock — see runCreationSideEffects.
   * @param cards Cards that were created.
   * @param location 'project', or the full name of the template they belong to.
   */
  public async addCreatedCards(cards: Card[], location: string) {
    const tree =
      location === 'project' ? this.cardTree : this.templateTree(location);
    for (const card of cards) {
      tree.insert(card);
    }
    return this.calculationEngine.refreshCardFacts(cards);
  }

  /**
   * Runs the creation query for cards that were just added, and applies the
   * side effects it asks for.
   *
   * Must run inside a write-lock context, after addCreatedCards: the query
   * only sees the new cards once their facts have been projected.
   * @param cardKeys Keys of the cards that were created.
   */
  public async runCreationSideEffects(cardKeys: string[]) {
    const queryResult = await this.calculationEngine.creationQuery(
      cardKeys,
      'localApp',
    );
    await this.executeSideEffects(
      queryResult?.at(0),
      // Empty seed: the created cards' initial "Create" transitions already
      // happened during creation itself; a re-entrant "Create" side effect
      // would be rejected anyway by the fromState check, so nothing needs
      // to be pre-marked visited here.
      new Set<string>(),
    );
  }

  /**
   * Checks if a given path is a project.
   * @param path Path to a project
   * @returns true, if in the given path there is a project; false otherwise
   */
  static isCreated(path: string): boolean {
    return pathExists(join(path, 'cardRoot'));
  }

  /**
   * Returns an array of cards in the project, in the templates or both.
   * Cards don't have content and nor metadata.
   * @param cardsFrom Where to return cards from (project, templates, or both)
   * @returns all cards in the project per container.
   */
  public async listCards(
    cardsFrom: CardLocation = CardLocation.all,
  ): Promise<CardListContainer[]> {
    const cardListContainer: CardListContainer[] = [];
    if (
      cardsFrom === CardLocation.all ||
      cardsFrom === CardLocation.projectOnly
    ) {
      cardListContainer.push({
        name: this.projectName,
        type: 'project',
        cards: this.cardKeys(),
      });
    }

    if (
      cardsFrom === CardLocation.all ||
      cardsFrom === CardLocation.templatesOnly
    ) {
      const templates = this.resources.templates();
      for (const template of templates) {
        const templateObject = template.templateObject();
        if (templateObject) {
          // todo: optimization - do all this in parallel
          const templateCards = templateObject.listCards();
          if (templateCards.length) {
            cardListContainer.push({
              name: template.data?.name || '',
              type: 'template',
              cards: templateCards.map((item) => item.key),
            });
          }
        }
      }
    }
    return cardListContainer;
  }

  /**
   * Return cardIDs of the cards in the project or from templates, or both.
   * @param cardsFrom Where to return cards from (project, templates, or both)
   * @returns Array of cardIDs.
   * @note that cardIDs are not sorted.
   */
  public async listCardIds(
    cardsFrom: CardLocation = CardLocation.all,
  ): Promise<Set<string>> {
    const cardContainers = await this.listCards(cardsFrom);
    const allCardIDs = new Set<string>();
    for (const container of cardContainers) {
      const cards = container.cards;
      cards.forEach((card) => allCardIDs.add(card));
    }
    return allCardIDs;
  }

  /**
   * Returns details of a certain module.
   * @param moduleName Name of the module.
   * @returns module details, or undefined if module cannot be found.
   */
  public async module(moduleName: string): Promise<ModuleContent | undefined> {
    const module = await this.findModule(moduleName);
    if (module && module.path) {
      const modulePath = module.path;
      const moduleConfig = await readCardsConfig(
        join(modulePath, Project.projectConfigFileName),
      );
      return {
        name: moduleConfig.name,
        description: moduleConfig.description || '',
        version: moduleConfig.version,
        modules: moduleConfig.modules,
        hubs: moduleConfig.hubs,
        path: modulePath,
        cardKeyPrefix: moduleConfig.cardKeyPrefix,
        calculations: this.resources.moduleResourceNames(
          'calculations',
          moduleName,
        ),
        cardTypes: this.resources.moduleResourceNames('cardTypes', moduleName),
        fieldTypes: this.resources.moduleResourceNames(
          'fieldTypes',
          moduleName,
        ),
        graphModels: this.resources.moduleResourceNames(
          'graphModels',
          moduleName,
        ),
        graphViews: this.resources.moduleResourceNames(
          'graphViews',
          moduleName,
        ),
        linkTypes: this.resources.moduleResourceNames('linkTypes', moduleName),
        reports: this.resources.moduleResourceNames('reports', moduleName),
        templates: this.resources.moduleResourceNames('templates', moduleName),
        workflows: this.resources.moduleResourceNames('workflows', moduleName),
      };
    }
    return undefined;
  }

  /**
   * Returns an array of new unique card keys with project prefix (e.g. test_x649it4x).
   * Random part of string will be always 8 characters in base-36 (0-9a-z)
   * @param keysToCreate How many new cards are to be created.
   * @returns an array of new card key strings
   * @throws if a unique key could not be created within set number of attempts
   */
  public newCardKeys(keysToCreate: number): string[] {
    return this.keyRegistry.allocate(keysToCreate);
  }

  /**
   * Returns a class that handles the project's paths.
   */
  public get paths(): ProjectPaths {
    return this.projectPaths;
  }

  /**
   * Returns the project's GitManager instance.
   */
  public get git(): GitManager {
    return this.gitManager;
  }

  /**
   * Initialize git repo for autocommit mode. No-op if autocommit is disabled.
   */
  public async initializeGit(): Promise<void> {
    if (this.options.autocommit) {
      await this.gitManager.initialize(getCommitContext().author);
    }
    if (this.options.autopush) void this.gitSync.push();
  }

  /**
   * Populates the card cache, if it has not been populated.
   */
  public async populateCaches() {
    if (!this.cardTree.isPopulated) {
      // Only collect modules that are registered in the project configuration
      if (this.configuration.modules && this.configuration.modules.length > 0) {
        this.resources.changedModules();
      }
      await this.populateCardsCache();
    }
  }

  /**
   * Returns project name.
   */
  public get projectName(): string {
    return this.settings.name;
  }

  /**
   * Returns project prefix.
   */
  public get projectPrefix(): string {
    return this.settings.cardKeyPrefix;
  }

  /**
   * Returns all prefixes used in the project.
   * This includes both direct dependencies and transient dependencies.
   * @returns all prefixes used in the project.
   */
  public allModulePrefixes(): string[] {
    return this.cachedAllModulePrefixes;
  }

  /**
   * Returns prefixes for direct module dependencies only (from cardsConfig.json).
   * @returns prefixes for direct module dependencies.
   */
  public projectPrefixes(): string[] {
    const prefixes: string[] = [this.projectPrefix];
    const moduleNames = this.configuration.modules.map((item) => item.name);
    prefixes.push(...moduleNames);

    return prefixes;
  }

  /**
   * Removes an attachment from a card.
   * @param cardKey The card to remove attachment from
   * @param fileName The name of the attachment file to remove
   * @throws if trying to remove module card attachment, or the attachment was not found.
   */
  public async removeCardAttachment(
    cardKey: string,
    fileName: string,
  ): Promise<void> {
    await this.treeOf(cardKey).removeAttachment(cardKey, fileName);
  }

  /**
   * Renames a card's attachment file, keeping the card cache in step with it.
   * @param cardKey Card whose attachment is renamed.
   * @param fileName Current attachment file name.
   * @param newFileName New attachment file name.
   * @throws if the card or the attachment does not exist.
   */
  public async renameCardAttachment(
    cardKey: string,
    fileName: string,
    newFileName: string,
  ): Promise<void> {
    await this.treeOf(cardKey).renameAttachment(cardKey, fileName, newFileName);
  }

  /**
   * Refreshes caches after the module installation set has changed on disk.
   * Invalidates the module resource cache, rebuilds the all-module-prefix
   * list, and reloads template cards so the Project API reflects the new
   * module layout.
   */
  public async refreshAfterModuleChange(
    appliedModules?: string[],
  ): Promise<void> {
    this.resources.changedModules();
    this.refreshAllModulePrefixes();
    if (!appliedModules) {
      await this.populateTemplateCards();
      return;
    }
    // Only the modules that landed changed on disk, so only their templates
    // need rereading. A module's templates are the ones whose name carries its
    // prefix.
    const prefixes = new Set(appliedModules);
    const templateNames = this.resources
      .templates()
      .map((template) => template.templateObject().fullName)
      .filter((name) => prefixes.has(resourceName(name).prefix));
    await this.populateTemplateCards(templateNames);
  }

  /**
   * Registers the folder a template's cards are rooted at.
   * @param templateName Full name of the template.
   * @param cardsFolder The template's 'c' folder.
   */
  public registerTemplateCardsFolder(
    templateName: string,
    cardsFolder: string,
  ): void {
    this.templateTree(templateName, cardsFolder);
  }

  /**
   * Accessor for resource handler.
   * @returns Resource handler instance.
   */
  public get resources(): ResourceHandler {
    return this.resourceHandler;
  }

  /**
   * Show cards of a project.
   * @returns an array of all project cards in the project.
   */
  public showProjectCards(): Card[] {
    return this.cardTree.rootCards();
  }

  /**
   * Returns cards from single template.
   * @param templateName Name of the template (supports both full names like 'decision/templates/decision' and short names like 'decision')
   * @returns List of cards from template.
   */
  public templateCards(templateName: string): Card[] {
    return this.templateTree(templateName).cards();
  }

  /**
   * How a card's container is projected into clingo facts.
   *
   * Template cards get every metadata fact a project card gets, but no
   * card(Key) fact — that, and not a location field, is what makes them
   * invisible to every query predicated on card(K). Their root cards name
   * their template as their parent, which is what the template trees are
   * rooted at in fact-land.
   * @param cardKey Card key whose container to describe.
   */
  public cardFactContext(cardKey: string): CardFactContext {
    const tree = this.keyRegistry.ownerOf(cardKey) ?? this.cardTree;
    return tree.factContext;
  }

  /**
   * Metadata-level view of a single template's cards: identity, tree position
   * and metadata, without the content or the attachment listing.
   * @param templateName Name of the template.
   * @returns nodes of the cards in that template.
   */
  public templateCardNodes(templateName: string): CardNode[] {
    return this.templateTree(templateName).nodes();
  }

  /**
   * Update a card's content.
   * @param cardKey card key to update.
   * @param content changed content
   */
  public async updateCardContent(cardKey: string, content: string) {
    const card = this.findCard(cardKey);
    card.content = content;

    // Both files, deliberately. The metadata write is what bumps
    // 'lastUpdated', which a content edit is expected to do -- see the
    // 'edit card content (success)' case in command-edit.test.ts, which fails
    // if only the content file is written. Spelled out as two primitive calls
    // rather than saveCard() so that the second write is visible at the call
    // site instead of looking like an accident.
    await this.saveCardContent(card);
    await this.saveCardMetadata(card);
    await this.handleCardChanged(card);
  }

  /**
   * Updates card metadata's single key.
   * @param cardKey card that is updated.
   * @param changedKey changed metadata key
   * @param newValue changed value for the key
   */
  public async updateCardMetadataKey(
    cardKey: string,
    changedKey: string,
    newValue: MetadataContent,
  ) {
    const card = this.findCard(cardKey);
    if (!card.metadata) {
      return;
    }

    // Clearing a custom field removes the key entirely: absent and null both
    // mean "no value". Predefined fields keep their stored representation.
    const removeKey = newValue == null && !isPredefinedField(changedKey);
    if (removeKey) {
      if (!(changedKey in card.metadata)) {
        return;
      }
    } else if (card.metadata[changedKey] === newValue) {
      return;
    }

    const cardAsRecord: Record<string, MetadataContent> = card.metadata;
    if (removeKey) {
      delete cardAsRecord[changedKey];
    } else {
      // A predefined field is never removed, so undefined must land as null:
      // an undefined value would be dropped from both the file and the cache.
      cardAsRecord[changedKey] = newValue ?? null;
    }

    const invalidCard = this.treeOf(cardKey).validationApplies
      ? await this.validateCard(card)
      : '';
    if (invalidCard.length !== 0) {
      throw new Error(invalidCard);
    }

    // A metadata write cannot relocate a card, so there is nothing structural
    // to follow up here: the rank-change branch that re-read the card and
    // compared its path against the pre-write path could never see a
    // difference. Moving a card is moveCard's job.
    await this.saveCardMetadata(card);
  }

  /**
   * Updates a card's metadata.
   * @param card affected card
   * @param changedMetadata changed content for the card
   */
  public async updateCardMetadata(card: Card, changedMetadata: CardMetadata) {
    card.metadata = changedMetadata;
    if (await this.saveCardMetadata(card)) {
      await this.handleCardChanged(card);
    }
  }

  // Wrapper to run onTransition query.
  private async transitionChangesQuery(cardKey: string, transition: string) {
    if (!cardKey || !transition) return undefined;
    return this.calculationEngine.runQuery('onTransition', 'localApp', {
      cardKey,
      transition,
    });
  }

  /**
   * Performs a single workflow transition without cascading, and returns
   * its side effects for the caller to execute. Throws if the card is
   * missing, the transition is not available from the card's current state,
   * or the transition is denied.
   *
   * Must run inside a write-lock context (the transition command, or the
   * creation flow's side-effect execution).
   */
  public async performTransition(
    cardKey: string,
    transitionName: string,
  ): Promise<SideEffects | undefined> {
    const card = this.findCard(cardKey);

    if (!card.metadata?.cardType) {
      throw new Error(`Card does not have card type`);
    }
    // Card type
    const cardType = this.resources
      .byType(card.metadata?.cardType, 'cardTypes')
      .show();

    // Workflow
    const workflow = this.resources
      .byType(cardType.workflow, 'workflows')
      .show();

    const currentState = card.metadata.workflowState;

    // A transition is identified by its (unique) name and leads to a single
    // target state, though it may be available from several states or all
    // states ('*'). Find it by name, then check it can be made from the
    // card's current state.
    const byName = workflow.transitions.filter(
      (item) => item.name === transitionName,
    );
    if (byName.length === 0) {
      const transitionNames = workflow.transitions.map((item) => item.name);
      throw new Error(`Card's workflow '${cardType.workflow}' does not contain state transition '${transitionName}'.
                          \nThe available transitions are: ${transitionNames.join(', ')}`);
    }

    const found = byName.find(
      (item) =>
        item.fromState.includes(currentState) || item.fromState.includes('*'),
    );
    if (!found) {
      throw new Error(
        `Card's workflow '${cardType.workflow}' does not contain state transition from state '${currentState}' for '${transitionName}'`,
      );
    }

    const actionGuard = new ActionGuard(this.calculationEngine);
    await actionGuard.checkPermission('transition', cardKey, transitionName);

    card.metadata.workflowState = found.toState;
    // lastUpdated is stamped by saveCardMetadata on every save; only
    // lastTransitioned needs to be set here.
    card.metadata.lastTransitioned = new Date().toISOString();
    await this.updateCardMetadata(card, card.metadata);

    // A broken module calculation must not fail the transition itself.
    try {
      const queryResult = await this.transitionChangesQuery(
        cardKey,
        transitionName,
      );
      return queryResult?.at(0);
    } catch (error) {
      this.logger.warn(
        {
          cardKey,
          transition: transitionName,
          error: error instanceof Error ? error.message : String(error),
        },
        'onTransition query failed; side effects skipped',
      );
      return undefined;
    }
  }

  /**
   * Executes a transition's side effects (field updates and cascading
   * transitions on other cards). Never throws: module calculation problems
   * must not fail the user's primary action.
   * @param effects Side effects from an onTransition/onCreation query.
   * @param visited `cardKey:transitionName` pairs already attempted in this
   *                cascade.
   */
  public async executeSideEffects(
    effects: SideEffects | undefined,
    visited: Set<string>,
  ): Promise<void> {
    try {
      await applySideEffects(this, effects, visited, (card, name) =>
        this.performTransition(card, name),
      );
    } catch (error) {
      this.logger.warn(
        {
          attempted: [...visited],
          error: error instanceof Error ? error.message : String(error),
        },
        'Applying transition side effects failed',
      );
    }
  }
}
