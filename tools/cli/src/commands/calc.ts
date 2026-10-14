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

import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';

import { type Command } from 'commander';

import { type CommandOptions } from '@cyberismo/data-handler';
import type { Context } from '@cyberismo/model';

import { CommandGroup, contextOption } from '../lib/args.js';
import { onProject } from '../lib/errors.js';
import { printJson, printResult } from '../lib/output.js';

export function registerCalc(program: Command) {
  const calculate = new CommandGroup('calc').description(
    'Used for running logic programs',
  );
  program.addCommand(calculate);

  calculate
    .command('generate')
    .description('Generate a logic program')
    .argument(
      '<destination>',
      'Path to an output file. Command writes the logic program to this file.',
    )
    .argument('[query]', 'Query to run')
    .action(
      async (
        destination: string,
        query: string,
        options: CommandOptions<'calc'>,
      ) => {
        await onProject(
          Object.assign({}, options, program.opts()),
          async (ws) => writeFile(destination, await ws.queries.program(query)),
        );
        printResult();
      },
    );

  calculate
    .command('run')
    .description('Run a logic program')
    .argument('<filePath>', 'Path to the logic program')
    .addOption(contextOption)
    .action(async (filePath: string, options: CommandOptions<'calc'>) => {
      const result = await onProject(
        Object.assign({}, options, program.opts()),
        (ws) =>
          ws.queries.runLogicProgram(
            readFileSync(filePath, 'utf-8'),
            (options.context || 'commandLine') as Context,
          ),
      );
      printJson(result);
    });
}
