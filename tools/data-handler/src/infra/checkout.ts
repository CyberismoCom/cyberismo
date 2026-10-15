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

import { CalculationEngine } from './calculation-engine.js';
import { CardKeyRegistry } from './card-keys.js';
import { CardTree, type CardTreeChange } from './card-tree.js';
import {
  CardNotFoundError,
  DuplicateCardKeyError,
} from '../shared/exceptions/index.js';
import { type CardNode, type ModuleContent } from '@cyberismo/model';
import { pathExists } from '../shared/utils/file-utils.js';
import { isModulePath } from '../shared/utils/card-utils.js';
import { ProjectConfiguration } from './project-settings.js';
import { resourceName } from '../shared/utils/resource-utils.js';
import { ProjectPaths } from './paths/project-paths.js';
import { readCardsConfig } from './paths/cards-config.js';
import { ResourceHandler } from './resource-handler.js';
import { ContentWatcher } from './project-content-watcher.js';
import { getChildLogger, initLogger } from '../shared/utils/log-utils.js';
import { RWLock } from './tx/rw-lock.js';
import { GitSync } from './git/git-sync.js';
import { GitManager } from './git/git-manager.js';
import { commitTrailers } from './tx/tx-record.js';
import { ChangeFeed, changedAnything } from './tx/change-feed.js';
import { Validate } from '../domain/validation/validate.js';

import type { TemplateResource } from '../domain/resources/template-resource.js';
import type { Level } from 'pino';

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
export interface CheckoutOptions {
  watchResourceChanges?: boolean;
  autocommit?: boolean;
  autopush?: boolean;
}

/** How a checkout is opened: its options and the level it logs at. */
export interface OpenOptions extends CheckoutOptions {
  logLevel?: Level;
}

/**
 * Represents project folder.
 */
export class Checkout {
  public static cardContentFile = 'index.adoc';
  public static cardMetadataFile = 'index.json';
  public static projectConfigFileName = 'cardsConfig.json';
  public static schemaContentFile = '.schema';

  public basePath: string;
  public readonly lock = new RWLock();
  public readonly changeFeed = new ChangeFeed();
  /** Set once the holder has let go of this checkout; nothing may apply into it. */
  public disposed = false;
  public calculationEngine: CalculationEngine;
  private projectCardTree: CardTree;
  // Kept here because a TemplateResource does not survive resources.changed().
  private templateCardTrees: Map<string, CardTree> = new Map();
  public readonly keyRegistry: CardKeyRegistry;
  private gitManager: GitManager;
  private readonly gitSync: GitSync;
  private logger = getChildLogger({ module: 'Project' });
  private projectPaths: ProjectPaths;
  private resourceHandler: ResourceHandler;
  private resourceWatcher: ContentWatcher | undefined;
  private settings: ProjectConfiguration;
  private cachedAllModulePrefixes: string[] = [];

  constructor(
    path: string,
    private options: CheckoutOptions = {
      watchResourceChanges: false,
    },
  ) {
    const settings = new ProjectConfiguration(
      join(path, '.cards', 'local', Checkout.projectConfigFileName),
    );
    this.basePath = path;
    this.settings = settings;
    this.keyRegistry = new CardKeyRegistry(() => settings.cardKeyPrefix);
    this.projectCardTree = new CardTree({
      name: 'project',
      rootPath: join(path, 'cardRoot'),
      kind: 'project',
      writable: true,
      keys: this.keyRegistry,
      onChange: (change) => this.recordCardChange(change),
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
      this.lock.onAfterWrite(async (tx) => {
        tx.commit = await this.gitManager.commit(
          tx.message ?? 'Autocommit',
          tx.identity,
          commitTrailers(tx.actor),
        );
        if (this.options.autopush) void this.gitSync.push();
      });

      // Rollback on failed writes
      this.lock.onWriteError(async () => {
        // The directory may already belong to the checkout that replaced
        // this one; rolling back would undo its changes.
        if (this.disposed) return;
        await this.gitManager.rollback();
        await this.repopulate();
      });
    } else {
      // Without a rollback, a failed write that changed something may leave
      // the caches and the files apart; clients are told to reload.
      this.lock.onWriteError(async (_error, tx) => {
        if (!changedAnything(tx)) {
          return;
        }
        try {
          await this.repopulate();
        } catch (repopulateError) {
          // The write's own error is the one its caller needs.
          this.logger.error({ error: repopulateError }, 'Repopulate failed');
          return;
        }
        tx.cause = 'failed-write';
        this.changeFeed.seal(tx, this.projectPrefix);
      });
    }

    // Registered last: a write is numbered only once every hook before it,
    // the commit included, has succeeded.
    this.lock.onAfterWrite(async (tx) => {
      this.changeFeed.seal(tx, this.projectPrefix);
    });
    this.lock.onReleased((tx) => this.changeFeed.publish(tx));
  }

  /**
   * Opens the checkout at `path` and loads it. Its holder disposes it.
   * @throws if the project's schema version is not supported.
   */
  public static async open(
    path: string,
    options?: OpenOptions,
  ): Promise<Checkout> {
    // Set up logger before constructing anything so eager child loggers work
    if (options?.logLevel) {
      const logPath = join(path, '.logs', 'cyberismo_data-handler.log');
      initLogger(options.logLevel, logPath);
    }
    const checkout = new Checkout(path, {
      watchResourceChanges: options?.watchResourceChanges,
      autocommit: options?.autocommit,
      autopush: options?.autopush,
    });
    const compat = checkout.configuration.checkSchemaVersion();
    if (!compat.isCompatible) {
      checkout.dispose();
      throw new Error(compat.message);
    }
    try {
      await checkout.initialize();
    } catch (error) {
      checkout.dispose();
      throw error;
    }
    return checkout;
  }

  /**
   * Loads the checkout: module resources, caches, git and the engine's facts.
   */
  public async initialize() {
    this.resources.changedModules();
    await this.populateCaches();
    await this.initializeGit();
    await this.calculationEngine.generate();
  }

  // Records a tree mutation into the write running it; outside a write
  // (loading, direct tree use) there is nothing to record into.
  private recordCardChange({ updated = [], removed = [] }: CardTreeChange) {
    const cards = this.lock.currentTx()?.touched.cards;
    if (!cards) {
      return;
    }
    for (const key of updated) {
      cards.removed.delete(key);
      cards.updated.add(key);
    }
    for (const key of removed) {
      cards.updated.delete(key);
      cards.removed.add(key);
    }
  }

  // Re-reads settings, modules, resources, cards and facts from disk, in
  // place, so handles over the checkout stay valid.
  private async repopulate() {
    // In place: the key registry reads the prefix from this object.
    this.settings.reload();
    this.refreshAllModulePrefixes();
    this.resources.changed();
    this.resources.changedModules();
    this.clearCards();
    await this.populateCardsCache();
    Validate.getInstance().clearCaches();
    await this.calculationEngine.generate();
  }

  /** The tree holding the project's own cards. */
  public get cardTree(): CardTree {
    return this.projectCardTree;
  }

  /**
   * Reserves card keys for cards that are about to be created.
   * @param count How many keys to allocate.
   */
  public allocateCardKeys(count: number): string[] {
    return this.keyRegistry.allocate(count);
  }

  /**
   * The tree holding one template's cards, created on first use.
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
    if (!rootPath) {
      throw new Error(`Template '${templateName}' does not exist`);
    }
    const tree = new CardTree({
      name: templateName,
      rootPath,
      kind: 'template',
      writable: !isModulePath(rootPath),
      keys: this.keyRegistry,
      onChange: (change) => this.recordCardChange(change),
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
    const template = this.templateResource(templateName);
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

  /**
   * Populate template cards into the card cache.
   */
  private async populateTemplateCards(templateNames?: string[]): Promise<void> {
    try {
      const all = this.resources.templates();

      // A tree whose template is no longer listed is stale whatever the scope.
      const present = new Set(all.map((template) => template.fullName));
      for (const name of this.templateCardTrees.keys()) {
        if (!present.has(name)) {
          this.removeTemplateTree(name);
        }
      }

      const templates = all.filter(
        (template) =>
          !templateNames || templateNames.includes(template.fullName),
      );

      await Promise.all(
        templates.map((template) =>
          this.templateTree(
            template.fullName,
            template.templateCardsFolder(),
          ).load(),
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
  private async populateCardsCache(): Promise<void> {
    await this.cardTree.load();
    await this.populateTemplateCards();
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
   * Returns project configuration.
   * @returns project configuration.
   */
  public get configuration(): ProjectConfiguration {
    return this.settings;
  }

  /**
   * Looks up a template resource by its name.
   * @param templateName Full resource name in the form `<prefix>/templates/<name>`
   *   (e.g. 'decision/templates/decision').
   * @returns the template resource, or undefined if not found.
   */
  public templateResource(templateName: string): TemplateResource | undefined {
    try {
      return this.resources.byType(templateName, 'templates');
    } catch {
      return undefined;
    }
  }

  /**
   * Cleanups project when it is being closed.
   */
  public dispose() {
    this.disposed = true;
    if (this.resourceWatcher) {
      this.resourceWatcher.close();
      this.resourceWatcher = undefined;
    }
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

    return Checkout.findProjectRoot(parentPath);
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
   * Checks if a given path is a project.
   * @param path Path to a project
   * @returns true, if in the given path there is a project; false otherwise
   */
  static isCreated(path: string): boolean {
    return pathExists(join(path, 'cardRoot'));
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
        join(modulePath, Checkout.projectConfigFileName),
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
      await this.gitManager.initialize();
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
    // A module's templates are the ones whose name carries its prefix.
    const prefixes = new Set(appliedModules);
    const templateNames = this.resources
      .templates()
      .map((template) => template.fullName)
      .filter((name) => prefixes.has(resourceName(name).prefix));
    await this.populateTemplateCards(templateNames);
  }

  /**
   * Drops every card the project holds, so that the next populate reads them
   * all from disk again.
   */
  public clearCards(): void {
    this.cardTree.clear();
    for (const tree of this.templateTrees()) {
      tree.clear();
    }
  }

  /**
   * Accessor for resource handler.
   * @returns Resource handler instance.
   */
  public get resources(): ResourceHandler {
    return this.resourceHandler;
  }
}
