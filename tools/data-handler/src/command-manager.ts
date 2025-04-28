/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import {
  Calculate,
  Create,
  Edit,
  Export,
  ExportSite,
  Import,
  Move,
  Remove,
  Rename,
  Show,
  Transition,
  Update,
  Validate,
} from './commands/index.js';
import { Project } from './containers/project.js';

// Handles commands and ensures that no extra instances are created.
export class CommandManager {
  private static instance: CommandManager;

  public project: Project;
  public calculateCmd: Calculate;
  public createCmd: Create;
  public editCmd: Edit;
  public exportSiteCmd: ExportSite;
  public exportCmd: Export;
  public importCmd: Import;
  public moveCmd: Move;
  public removeCmd: Remove;
  public renameCmd: Rename;
  public showCmd: Show;
  public transitionCmd: Transition;
  public updateCmd: Update;
  public validateCmd: Validate;

  constructor(path: string) {
    this.project = new Project(path);
    this.validateCmd = Validate.getInstance();

    this.showCmd = new Show(this.project);
    this.calculateCmd = new Calculate(this.project);
    this.createCmd = new Create(this.project, this.calculateCmd);
    this.editCmd = new Edit(this.project, this.calculateCmd);
    this.exportCmd = new Export(this.project, this.calculateCmd, this.showCmd);
    this.exportSiteCmd = new ExportSite(
      this.project,
      this.calculateCmd,
      this.showCmd,
    );
    this.importCmd = new Import(this.project, this.createCmd);
    this.moveCmd = new Move(this.project, this.calculateCmd);
    this.removeCmd = new Remove(this.project, this.calculateCmd);
    this.renameCmd = new Rename(this.project, this.calculateCmd);
    this.transitionCmd = new Transition(this.project, this.calculateCmd);
    this.updateCmd = new Update(this.project);
  }

  // Some commands needs initialization that cannot be performed inside constructor.
  // Add such calls here.
  private async initialize() {
    await this.project.collectModuleResources();
    await this.calculateCmd.generate();
  }

  /**
   * Either creates a new instance, or passes the current one.
   * New instance is created, if path differs, or there is no previous instance.
   * @param path Project path.
   * @returns Instance of this class.
   */
  public static async getInstance(path: string): Promise<CommandManager> {
    if (
      CommandManager.instance &&
      CommandManager.instance.project.basePath !== path
    ) {
      CommandManager.instance = new CommandManager(path);
      await CommandManager.instance.initialize();
    }
    if (!CommandManager.instance) {
      CommandManager.instance = new CommandManager(path);
      await CommandManager.instance.initialize();
    }
    return CommandManager.instance;
  }
}
