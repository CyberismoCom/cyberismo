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

import { type Command } from 'commander';

import { Cmd, type CommandOptions } from '@cyberismo/data-handler';

import { CommandWithPath } from '../lib/args.js';
import { commandHandler } from '../lib/dispatch.js';
import { handleResponse } from '../lib/output.js';

export function registerRename(program: Command) {
  // Rename command
  const renameCmd = new CommandWithPath('rename')
    .description(
      'Change project prefix and rename all the content with the new prefix. Only possible before the project has published a version, unless --force is given',
    )
    .argument('<to>', 'New project prefix')
    .option(
      '--force',
      'Rename even though a version has been published; the next version is then a new module',
    );
  program.addCommand(renameCmd);
  renameCmd.action(async (to: string, options: CommandOptions<'rename'>) => {
    const result = await commandHandler.command(
      Cmd.rename,
      [to],
      Object.assign({}, options, program.opts()),
    );
    handleResponse(result);
  });
}
