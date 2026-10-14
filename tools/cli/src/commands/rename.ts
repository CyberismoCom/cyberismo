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

import { type CommandOptions } from '@cyberismo/data-handler';

import { CommandWithPath } from '../lib/args.js';
import { onProject } from '../lib/errors.js';
import { printResultWithNote } from '../lib/output.js';

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
    const note = await onProject(
      Object.assign({}, options, program.opts()),
      async (ws) => {
        const published = (await ws.settings.info()).version;
        await ws.renameCmd.rename(to, options.force);
        return published
          ? `Version ${published} was published under the old prefix. The ` +
              `next version you publish is a new module: consumers must ` +
              `install it and remove the old one rather than update.`
          : undefined;
      },
    );
    printResultWithNote(note);
  });
}
