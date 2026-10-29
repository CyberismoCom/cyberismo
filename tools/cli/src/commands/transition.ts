// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

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
