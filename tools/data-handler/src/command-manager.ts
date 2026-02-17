/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { Calculate } from './commands/calculate.js';
import { Create } from './commands/create.js';
import { Edit } from './commands/edit.js';
import { Export } from './commands/export.js';
import { Fetch } from './commands/fetch.js';
import { Import } from './commands/import.js';
import { Migrate } from './commands/migrate.js';
import { Move } from './commands/move.js';
import { Remove } from './commands/remove.js';
import { Rename } from './commands/rename.js';
import { Show } from './commands/show.js';
import { Transition } from './commands/transition.js';
import { Update } from './commands/update.js';
import { Validate } from './commands/validate.js';
import { Project } from './containers/project.js';
import { runWithAuthor } from './utils/author-context.js';
import { ProjectPaths } from './containers/project/project-paths.js';
import pino, { type Level, type TransportTargetOptions } from 'pino';
import { setLogger } from './utils/log-utils.js';
import { join } from 'node:path';

export interface CommandManagerOptions {
  watchResourceChanges?: boolean;
  autoSaveConfiguration?: boolean;
  logLevel?: Level;
  autocommit?: boolean;
}

// Handles commands and ensures that no extra instances are created.
export class CommandManager {
  private static instance: CommandManager;

  public project: Project;
  public calculateCmd: Calculate;
  public createCmd: Create;
  public editCmd: Edit;
  public exportCmd: Export;
  public fetchCmd: Fetch;
  public importCmd: Import;
  public migrateCmd: Migrate;
  public moveCmd: Move;
  public removeCmd: Remove;
  public renameCmd: Rename;
  public showCmd: Show;
  public transitionCmd: Transition;
  public updateCmd: Update;
  public validateCmd: Validate;

  private pathHandler: ProjectPaths;

  constructor(path: string, options?: CommandManagerOptions) {
    this.project = new Project(path, {
      autoSave: options?.autoSaveConfiguration,
      watchResourceChanges: options?.watchResourceChanges,
      autocommit: options?.autocommit,
    });
    this.validateCmd = Validate.getInstance();

    this.calculateCmd = new Calculate(this.project);
    this.fetchCmd = new Fetch(this.project);
    this.showCmd = new Show(this.project, this.fetchCmd);
    this.createCmd = new Create(this.project);
    this.editCmd = new Edit(this.project);
    this.exportCmd = new Export(this.project, this.showCmd);
    this.importCmd = new Import(this.project, this.createCmd, this.fetchCmd);
    this.migrateCmd = new Migrate(this.project);
    this.moveCmd = new Move(this.project);
    this.removeCmd = new Remove(this.project, this.fetchCmd);
    this.renameCmd = new Rename(this.project);
    this.transitionCmd = new Transition(this.project);
    this.updateCmd = new Update(this.project);
    this.pathHandler = new ProjectPaths(path);
  }

  /**
   * Checks the schema version compatibility.
   * @returns
   *    isCompatible - true if compatible; false otherwise
   *    message - optional message related to compatibility.
   */
  public checkSchemaVersion(): { isCompatible: boolean; message?: string } {
    return this.project.configuration.checkSchemaVersion();
  }

  /**
   * Run a function with the given author set in async-local context.
   * Git commits made during the function will use this author.
   */
  public runAsAuthor<T>(
    author: { name: string; email: string },
    fn: () => Promise<T>,
  ): Promise<T> {
    return runWithAuthor(author, fn);
  }

  /**
   * Execute multiple commands as a single atomic write transaction.
   * All inner @write/@read calls reuse the same lock context.
   * Git commit fires once on success; rollback on any error.
   */
  public async atomic<T>(fn: () => Promise<T>): Promise<T> {
    return this.project.lock.write(fn);
  }

  /**
   * Execute multiple commands under a consistent read snapshot.
   * All inner @read calls reuse the same lock context.
   * Writers are blocked for the duration.
   */
  public async consistent<T>(fn: () => Promise<T>): Promise<T> {
    return this.project.lock.read(fn);
  }

  /**
   * Some commands needs initialization that cannot be performed inside constructor.
   * Add such calls here.
   */
  public async initialize() {
    this.project.resources.changedModules();
    await this.project.populateCaches();
    await this.project.initializeGit();
  }

  /**
   * Sets the logger for the command manager.
   * @param level Log level.
   */
  public setLogger(level: Level) {
    const all: TransportTargetOptions[] = [
      {
        target: 'pino/file',
        level: 'trace',
        options: { destination: this.pathHandler.logPath, mkdir: true },
      },
      {
        target: 'pino/file',
        level: level,
        options: { destination: 1 }, // stdout
      },
    ];

    setLogger(
      pino({
        level: 'trace',
        transport: {
          targets: all,
        },
      }),
    );
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
    options?: CommandManagerOptions,
  ): Promise<CommandManager> {
    // Set up logger before constructing anything so eager child loggers work
    if (options?.logLevel) {
      const logPath = join(path, '.logs', 'cyberismo_data-handler.log');
      setLogger(
        pino({
          level: 'trace',
          transport: {
            targets: [
              {
                target: 'pino/file',
                level: 'trace',
                options: { destination: logPath, mkdir: true },
              },
              {
                target: 'pino/file',
                level: options.logLevel,
                options: { destination: 1 },
              },
            ],
          },
        }),
      );
    }

    if (
      CommandManager.instance &&
      CommandManager.instance.project.basePath !== path
    ) {
      CommandManager.instance.project.dispose();
      CommandManager.instance = new CommandManager(path, options);
      await CommandManager.instance.initialize();
    }
    if (!CommandManager.instance) {
      CommandManager.instance = new CommandManager(path, options);
      await CommandManager.instance.initialize();
    }

    return CommandManager.instance;
  }
}
