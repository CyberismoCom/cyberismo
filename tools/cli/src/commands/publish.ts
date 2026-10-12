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

export function registerPublish(program: Command) {
  // Publish command - creates a git tag from cardsConfig version and pushes
  const publishCmd = new CommandWithPath('publish')
    .description(
      'Publish the current version (creates annotated git tag, pushes to remote). Run "cyberismo create version" first to set the version.',
    )
    .option('--dry-run', 'Show what would happen without doing it')
    .option('--remote <name>', 'Git remote to push to (default: origin)');
  program.addCommand(publishCmd);
  publishCmd.action(async (options: CommandOptions<'publish'>) => {
    const mergedOptions = Object.assign({}, options, program.opts());
    const args = [options.dryRun ? 'true' : 'false', options.remote ?? ''];
    const result = await commandHandler.command(
      Cmd.publish,
      args,
      mergedOptions,
    );
    handleResponse(result);
  });
}
