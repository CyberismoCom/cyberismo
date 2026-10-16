// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { type Command } from 'commander';
import { CommandGroup } from '../lib/args.js';
import { onProject } from '../lib/errors.js';
import { printResult } from '../lib/output.js';
import type { RankCommandOptions } from '../options.js';

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
        options: RankCommandOptions,
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
    .action(async (cardKey: string, options: RankCommandOptions) => {
      await onProject(Object.assign({}, options, program.opts()), (ws) =>
        cardKey ? ws.cards.rebalance(cardKey) : ws.cards.rebalanceAll(),
      );
      printResult();
    });
}
