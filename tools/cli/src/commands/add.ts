// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { type Command } from 'commander';
import { CommandGroup, hubLocation } from '../lib/args.js';
import { fail, onProject } from '../lib/errors.js';
import { printResult } from '../lib/output.js';
import type { AddCommandOptions } from '../options.js';

export function registerAdd(program: Command) {
  const addCmd = new CommandGroup('add').description(
    'Add items to the project',
  );
  program.addCommand(addCmd);

  // Add card to a template
  addCmd
    .command('card')
    .description('Add card to a template')
    .argument(
      '<template>',
      'Template for a new card. \nYou can list the templates in a project with "show templates" command.',
    )
    .argument(
      '<cardType>',
      'Card type to use for the new card. \nYou can list the card types in a project with "show cardTypes" command.',
    )
    .argument('[cardKey]', "Parent card's card key")
    .option('-r, --repeat <quantity>', 'Add multiple cards to a template')
    .action(
      async (
        template: string,
        cardType: string,
        cardKey: string,
        options: AddCommandOptions,
      ) => {
        const addedCards = await onProject(
          Object.assign({}, options, program.opts()),
          (ws) =>
            ws.cards.addToTemplate(cardType, template, cardKey, options.repeat),
        );
        if (!addedCards || addedCards.length === 0) {
          fail('Failed to add cards');
        }
        printResult(
          addedCards.length > 1
            ? `${addedCards.length} cards were added to the template '${template} : ${JSON.stringify(addedCards)}'`
            : `card '${addedCards[0]}' was added to the template '${template}'`,
        );
      },
    );

  addCmd
    .command('hub')
    .description('Add a hub to the project')
    .argument(
      '<location>',
      'Hub URL. Default hub can be added by using "default"',
    )
    .action(async (location: string, options: AddCommandOptions) => {
      location = hubLocation(location);
      await onProject(Object.assign({}, options, program.opts()), (ws) =>
        ws.settings.hubs.add(location),
      );
      printResult(`Hub '${location}' was added to the project`);
    });
}
