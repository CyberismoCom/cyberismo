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

import { pathGuideline } from '../lib/args.js';
import { commandHandler } from '../lib/dispatch.js';
import { handleResponse } from '../lib/output.js';

export function registerMigrate(program: Command) {
  // Migrate command
  program
    .command('migrate')
    .description('Migrate project schema to the latest version.')
    .option('-p, --project-path [path]', `${pathGuideline}`)
    .action(async (options: CommandOptions<'migrate'>) => {
      const result = await commandHandler.command(
        Cmd.migrate,
        [],
        Object.assign({}, options, program.opts()),
      );
      handleResponse(result);
    });
}
