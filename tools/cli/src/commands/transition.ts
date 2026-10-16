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
import { CommandWithPath } from '../lib/args.js';
import { onProject } from '../lib/errors.js';
import { printResult } from '../lib/output.js';
import type { TransitionCommandOptions } from '../options.js';

export function registerTransition(program: Command) {
  // Transition command
  const transitionCmd = new CommandWithPath('transition')
    .description('Transition a card to the specified state')
    .argument('<cardKey>', 'card key of a card')
    .argument(
      '<transition>',
      'Workflow state transition that is done.\nYou can list the workflows in a project with "show workflows" command.\nYou can see the available transitions with "show workflow <name>" command.',
    );
  program.addCommand(transitionCmd);
  transitionCmd.action(
    async (
      cardKey: string,
      transition: string,
      options: TransitionCommandOptions,
    ) => {
      await onProject(Object.assign({}, options, program.opts()), (ws) =>
        ws.cards.transition(cardKey, transition),
      );
      printResult();
    },
  );
}
