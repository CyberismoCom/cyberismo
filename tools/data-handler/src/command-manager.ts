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
import { Move } from './commands/move.js';
import { Remove } from './commands/remove.js';
import { Rename } from './commands/rename.js';
import { Show } from './commands/show.js';
import { Transition } from './commands/transition.js';
import { Update } from './commands/update.js';
import { Validate } from './commands/validate.js';
import { Project } from './containers/project.js';
import { ProjectPaths } from './containers/project/project-paths.js';
import pino, { type Level, type TransportTargetOptions } from 'pino';
import { setLogger } from './utils/log-utils.js';

export interface CommandManagerOptions {
  watchResourceChanges?: boolean;
  autoSaveConfiguration?: boolean;
  logLevel?: Level;
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
    });
    this.validateCmd = Validate.getInstance();

    this.calculateCmd = new Calculate(this.project);
    this.showCmd = new Show(this.project);
    this.createCmd = new Create(this.project);
    this.editCmd = new Edit(this.project);
    this.exportCmd = new Export(this.project, this.showCmd);
    this.fetchCmd = new Fetch(this.project);
    this.importCmd = new Import(this.project, this.createCmd);
    this.moveCmd = new Move(this.project);
    this.removeCmd = new Remove(this.project);
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
   * Some commands needs initialization that cannot be performed inside constructor.
   * Add such calls here.
   */
  public async initialize() {
    this.project.resources.changedModules();
    await this.project.populateCaches();
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

    if (options?.logLevel) {
      CommandManager.instance.setLogger(options?.logLevel);
    }
    return CommandManager.instance;
  }
}
