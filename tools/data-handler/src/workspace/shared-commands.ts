/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { Calculate } from '../commands/calculate.js';
import { Clean } from '../commands/clean.js';
import { Create } from '../commands/create.js';
import { Export } from '../commands/export.js';
import { Fetch } from '../commands/fetch.js';
import { Import } from '../commands/import.js';
import { Modules } from '../commands/modules.js';
import { Publish } from '../commands/publish.js';
import { Remove } from '../commands/remove.js';
import { Rename } from '../commands/rename.js';
import { Show } from '../commands/show.js';
import { Validate } from '../commands/validate.js';
import { Version } from '../commands/version.js';
import type { Checkout } from '../containers/project.js';

/**
 * The legacy command objects of one checkout, shared by all of its handles.
 * An entry goes when its group gets a façade.
 */
export class SharedCommands {
  public calculateCmd: Calculate;
  public cleanCmd: Clean;
  public createCmd: Create;
  public exportCmd: Export;
  public fetchCmd: Fetch;
  public importCmd: Import;
  public modulesCmd: Modules;
  public publishCmd: Publish;
  public removeCmd: Remove;
  public renameCmd: Rename;
  public showCmd: Show;
  public validateCmd: Validate;
  public versionCmd: Version;

  constructor(checkout: Checkout) {
    this.validateCmd = Validate.getInstance();

    this.calculateCmd = new Calculate(checkout);
    this.cleanCmd = new Clean(checkout);
    this.fetchCmd = new Fetch(checkout);
    this.modulesCmd = new Modules(checkout, this.fetchCmd);
    this.showCmd = new Show(checkout);
    this.createCmd = new Create(checkout);
    this.exportCmd = new Export(checkout);
    this.importCmd = new Import(checkout);
    this.publishCmd = new Publish(checkout);
    this.removeCmd = new Remove(checkout, this.fetchCmd, this.modulesCmd);
    this.renameCmd = new Rename(checkout);
    this.versionCmd = new Version(checkout);
  }
}

const byCheckout = new WeakMap<Checkout, SharedCommands>();

/**
 * The legacy command objects of `checkout`, created on first use.
 * @param checkout Checkout the commands work on.
 */
export function sharedCommands(checkout: Checkout): SharedCommands {
  let commands = byCheckout.get(checkout);
  if (!commands) {
    commands = new SharedCommands(checkout);
    byCheckout.set(checkout, commands);
  }
  return commands;
}
