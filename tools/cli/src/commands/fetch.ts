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

import { CommandGroup } from '../lib/args.js';
import { commandHandler } from '../lib/dispatch.js';
import { handleResponse } from '../lib/output.js';

export function registerFetch(program: Command) {
  const fetchCmd = new CommandGroup('fetch').description(
    'Retrieve external data to local file system.',
  );
  program.addCommand(fetchCmd);

  fetchCmd
    .command('hubs')
    .description('Retrieves module lists from hubs')
    .action(async (options: CommandOptions<'fetch'>) => {
      const result = await commandHandler.command(
        Cmd.fetch,
        ['hubs'],
        Object.assign({}, options, program.opts()),
      );
      handleResponse(result);
    });
}
