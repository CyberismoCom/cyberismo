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
import { printJson } from '../lib/output.js';
import { registerImportModule } from './module.js';

export function registerImport(program: Command) {
  const importCmd = new CommandGroup('import').description(
    'Import modules and data into the project',
  );
  program.addCommand(importCmd);

  registerImportModule(importCmd);

  // import csv
  importCmd
    .command('csv')
    .description('Imports cards from a csv file')
    .argument('<csvFile>', 'File to import from')
    .argument(
      '[cardKey]',
      'Parent card key. If defined, cards are created as children of this card',
    )
    .action(
      async (
        csvFile: string,
        cardKey: string,
        options: CommandOptions<'import'>,
      ) => {
        const cards = await onProject(
          Object.assign({}, options, program.opts()),
          (ws) => ws.importCmd.importCsv(csvFile, cardKey),
        );
        console.log('Imported cards:');
        printJson(cards);
      },
    );
}
