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
import { printResult } from '../lib/output.js';

export function registerMove(program: Command) {
  // Move command
  const moveCmd = new CommandWithPath('move')
    .description(
      'Moves a card from root to under another card, from under another card to root, or from under a one card to another.',
    )
    .argument('[source]', 'Source Card key that needs to be moved')
    .argument(
      '[destination]',
      'Destination Card key where "source" is moved to. If moving to root, use "root"',
    );
  program.addCommand(moveCmd);
  moveCmd.action(
    async (
      source: string,
      destination: string,
      options: CommandOptions<'move'>,
    ) => {
      await onProject(Object.assign({}, options, program.opts()), (ws) =>
        ws.cards.move(source, destination),
      );
      printResult();
    },
  );
}
