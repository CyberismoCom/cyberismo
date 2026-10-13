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

import { DEFAULT_HUB } from '@cyberismo/assets';
import { Cmd, type CommandOptions } from '@cyberismo/data-handler';

import { CommandGroup } from '../lib/args.js';
import { commandHandler } from '../lib/dispatch.js';
import { fail, onProject } from '../lib/errors.js';
import { handleResponse, printResult } from '../lib/output.js';

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
        options: CommandOptions<'add'>,
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
    .action(async (location: string, options: CommandOptions<'add'>) => {
      if (location === 'default') {
        location = DEFAULT_HUB;
      }
      const result = await commandHandler.command(
        Cmd.add,
        ['hub', location],
        Object.assign({}, options, program.opts()),
      );
      handleResponse(result);
    });
}
