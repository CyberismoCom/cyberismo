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

import { CommandGroup } from '../lib/args.js';
import { onProject } from '../lib/errors.js';
import { printResult } from '../lib/output.js';

export function registerRank(program: Command) {
  const rank = new CommandGroup('rank').description(
    'Manage card ranking and ordering',
  );
  program.addCommand(rank);

  rank
    .command('card')
    .description(
      'Set the rank of a card. Ranks define the order in which cards are shown.',
    )
    .argument('<cardKey>', 'Card key of the card to be moved')
    .argument(
      '<afterCardKey>',
      'Card key of the card that the card should be after. Use "first" to rank the card first.',
    )
    .action(
      async (
        cardKey: string,
        afterCardKey: string,
        options: CommandOptions<'rank'>,
      ) => {
        await onProject(Object.assign({}, options, program.opts()), (ws) =>
          afterCardKey === 'first'
            ? ws.cards.rankFirst(cardKey)
            : ws.cards.rank(cardKey, afterCardKey),
        );
        printResult();
      },
    );

  rank
    .command('rebalance')
    .description(
      'Rebalance the rank of all cards in the project. Can be also used, if ranks do not exist',
    )
    .argument(
      '[parentCardKey]',
      'if null, rebalance the whole project, otherwise rebalance only the direct children',
    )
    .action(async (cardKey: string, options: CommandOptions<'rank'>) => {
      await onProject(Object.assign({}, options, program.opts()), (ws) =>
        cardKey ? ws.cards.rebalance(cardKey) : ws.cards.rebalanceAll(),
      );
      printResult();
    });
}
