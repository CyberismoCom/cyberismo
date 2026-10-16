// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { type Command } from 'commander';
import { CommandWithPath } from '../lib/args.js';
import { onProject } from '../lib/errors.js';
import { printResult } from '../lib/output.js';
import type { MoveCommandOptions } from '../options.js';

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
      options: MoveCommandOptions,
    ) => {
      await onProject(Object.assign({}, options, program.opts()), (ws) =>
        ws.cards.move(source, destination),
      );
      printResult();
    },
  );
}
