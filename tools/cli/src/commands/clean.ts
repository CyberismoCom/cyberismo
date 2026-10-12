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

export function registerClean(program: Command) {
  // Clean command - removes dormant field values
  const cleanCmd = new CommandWithPath('clean')
    .description(
      'Remove dormant field values: values a card stores but that are not shown and not visible to logic programs (empty placeholders, fields the card type no longer declares, values on calculated fields)',
    )
    .option('--dry-run', 'Show what would be cleaned without cleaning');
  program.addCommand(cleanCmd);
  cleanCmd.action(async (options: CommandOptions<'clean'>) => {
    const mergedOptions = Object.assign({}, options, program.opts());
    const args = [options.dryRun ? 'true' : 'false'];
    const result = await commandHandler.command(Cmd.clean, args, mergedOptions);
    handleResponse(result);
  });
}
