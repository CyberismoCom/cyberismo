/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { Calculate } from '../commands/calculate.js';
import { Clean } from '../commands/clean.js';
import { Create } from '../commands/create.js';
import { Edit } from '../commands/edit.js';
import { Export } from '../commands/export.js';
import { Fetch } from '../commands/fetch.js';
import { Import } from '../commands/import.js';
import { Modules } from '../commands/modules.js';
import { Move } from '../commands/move.js';
import { Publish } from '../commands/publish.js';
import { Remove } from '../commands/remove.js';
import { Version } from '../commands/version.js';
import { Rename } from '../commands/rename.js';
import { Show } from '../commands/show.js';
import { Transition } from '../commands/transition.js';
import { Update } from '../commands/update.js';
import { Validate } from '../commands/validate.js';
import { Checkout } from '../containers/project.js';
import type { ActorRef } from '@cyberismo/model';
import {
  type CommitIdentity,
  runWithCommitContext,
} from '../utils/commit-context.js';
import { type Level } from 'pino';
import { join } from 'node:path';
import { initLogger } from '../utils/log-utils.js';
import { DEFAULT_HUB } from '@cyberismo/assets';

export interface WorkspaceOptions {
  watchResourceChanges?: boolean;
  logLevel?: Level;
  autocommit?: boolean;
  autopush?: boolean;
}

// Handles commands and ensures that no extra instances are created.
export class Workspace {
  private static instance: Workspace;

  public checkout: Checkout;
  public calculateCmd: Calculate;
  public cleanCmd: Clean;
  public createCmd: Create;
  public editCmd: Edit;
  public exportCmd: Export;
  public fetchCmd: Fetch;
  public importCmd: Import;
  public modulesCmd: Modules;
  public moveCmd: Move;
  public publishCmd: Publish;
  public removeCmd: Remove;
  public renameCmd: Rename;
  public showCmd: Show;
  public transitionCmd: Transition;
  public updateCmd: Update;
  public validateCmd: Validate;
  public versionCmd: Version;

  constructor(path: string, options?: WorkspaceOptions) {
    this.checkout = new Checkout(path, {
      watchResourceChanges: options?.watchResourceChanges,
      autocommit: options?.autocommit,
      autopush: options?.autopush,
    });
    const compat = this.checkout.configuration.checkSchemaVersion();
    if (!compat.isCompatible) {
      this.checkout.dispose();
      throw new Error(compat.message);
    }
    this.validateCmd = Validate.getInstance();

    this.calculateCmd = new Calculate(this.checkout);
    this.cleanCmd = new Clean(this.checkout);
    this.fetchCmd = new Fetch(this.checkout);
    this.modulesCmd = new Modules(this.checkout, this.fetchCmd);
    this.showCmd = new Show(this.checkout);
    this.createCmd = new Create(this.checkout);
    this.editCmd = new Edit(this.checkout);
    this.exportCmd = new Export(this.checkout, this.showCmd);
    this.importCmd = new Import(this.checkout, this.createCmd);
    this.moveCmd = new Move(this.checkout);
    this.publishCmd = new Publish(this.checkout);
    this.removeCmd = new Remove(this.checkout, this.fetchCmd, this.modulesCmd);
    this.renameCmd = new Rename(this.checkout);
    this.transitionCmd = new Transition(this.checkout);
    this.updateCmd = new Update(this.checkout);
    this.versionCmd = new Version(this.checkout);
  }

  /**
   * Checks the schema version compatibility.
   * @returns
   *    isCompatible - true if compatible; false otherwise
   *    message - optional message related to compatibility.
   */
  public checkSchemaVersion(): { isCompatible: boolean; message?: string } {
    return this.checkout.configuration.checkSchemaVersion();
  }

  /**
   * Run a function with the given author and actor set in async-local context.
   * Git commits made during the function use this author and record the actor.
   * @param author Commit author.
   * @param fn Function to run.
   * @param actor Who acted, recorded as commit trailers.
   */
  public runAsAuthor<T>(
    author: CommitIdentity,
    fn: () => Promise<T>,
    actor: ActorRef,
  ): Promise<T> {
    return runWithCommitContext({ author, actor }, fn);
  }

  /**
   * Execute multiple commands as a single atomic write transaction.
   * All inner @write/@read calls reuse the same lock context.
   * Git commit fires once on success; rollback on any error.
   */
  public async atomic<T>(fn: () => Promise<T>, message: string): Promise<T> {
    const run = () => this.checkout.lock.write(fn);
    return runWithCommitContext({ message }, run);
  }

  /**
   * Execute multiple commands under a consistent read snapshot.
   * All inner @read calls reuse the same lock context.
   * Writers are blocked for the duration.
   */
  public async consistent<T>(fn: () => Promise<T>): Promise<T> {
    return this.checkout.lock.read(fn);
  }

  /**
   * Some commands needs initialization that cannot be performed inside constructor.
   * Add such calls here.
   */
  public async initialize() {
    this.checkout.resources.changedModules();
    await this.checkout.populateCaches();
    await this.checkout.initializeGit();
    await this.checkout.calculationEngine.generate();
  }

  /**
   * Either creates a new instance, or passes the current one.
   * New instance is created, if path differs, or there is no previous instance.
   * @param path Project path.
   * @param watchResourceChanges Optional. If true, file changes are watched.
   * @returns Instance of this class.
   */
  public static async getInstance(
    path: string,
    options?: WorkspaceOptions,
  ): Promise<Workspace> {
    // Set up logger before constructing anything so eager child loggers work
    if (options?.logLevel) {
      const logPath = join(path, '.logs', 'cyberismo_data-handler.log');
      initLogger(options.logLevel, logPath);
    }

    if (Workspace.instance && Workspace.instance.checkout.basePath !== path) {
      Workspace.instance.checkout.dispose();
      Workspace.instance = new Workspace(path, options);
      await Workspace.instance.initialize();
    }
    if (!Workspace.instance) {
      Workspace.instance = new Workspace(path, options);
      await Workspace.instance.initialize();
    }

    return Workspace.instance;
  }

  /**
   * Creates a new project with default configuration.
   * Sets up the project files, initializes git, and adds the default hub.
   * @param projectPath Path where the project will be created
   * @param params Project parameters (name, prefix, category, description)
   * @param options Optional settings for the command manager and git user
   * @returns Initialized CommandManager for the new project
   */
  public static async createProjectWithDefaults(
    projectPath: string,
    params: {
      name: string;
      prefix: string;
      category?: string;
      description?: string;
    },
    options?: WorkspaceOptions & {
      gitUser?: { name: string; email: string };
    },
  ): Promise<Workspace> {
    await Create.createProject(
      projectPath,
      params.prefix,
      params.name,
      params.category ?? '',
      params.description ?? '',
    );

    const ws = new Workspace(projectPath, options);
    await ws.initialize();

    await ws.checkout.git.initialize(
      options?.gitUser
        ? { name: options.gitUser.name, email: options.gitUser.email }
        : undefined,
    );

    // Add default hub and fetch module data
    try {
      await ws.createCmd.addHubLocation(DEFAULT_HUB);
      await ws.fetchCmd.fetchHubs();
    } catch {
      // Hub setup is non-critical; project is still usable
    }

    return ws;
  }
}
