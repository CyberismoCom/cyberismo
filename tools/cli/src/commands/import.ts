// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { readFile } from 'node:fs/promises';

import { type Command } from 'commander';

import { CommandGroup } from '../lib/args.js';
import { onProject } from '../lib/errors.js';
import { printJson } from '../lib/output.js';
import { registerImportModule } from './module.js';
import type { ImportCommandOptions } from '../options.js';

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
        options: ImportCommandOptions,
      ) => {
        const cards = await onProject(
          Object.assign({}, options, program.opts()),
          // The file is read inside the write that commits under its name.
          (ws) =>
            ws.atomic(
              async () =>
                ws.cards.importCsv(await readFile(csvFile, 'utf-8'), cardKey),
              `Import cards from CSV ${csvFile}`,
            ),
        );
        console.log('Imported cards:');
        printJson(cards);
      },
    );
}
