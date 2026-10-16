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

import { Cmd, type CommandOptions } from '@cyberismo/data-handler';

import { CommandWithPath, contextOption } from '../lib/args.js';
import { commandHandler } from '../lib/dispatch.js';
import { handleResponse } from '../lib/output.js';

export function registerReport(program: Command) {
  // Report command
  const reportCmd = new CommandWithPath('report')
    .description('Runs a report')
    .argument(
      '<parameters>',
      'Path to parameters file. This file defines which report to run and what parameters to use.',
    )
    .argument(
      '[output]',
      'Optional output file; if omitted output will be directed to stdout',
    )
    .addOption(contextOption);
  program.addCommand(reportCmd);
  reportCmd.action(
    async (
      parameters: string,
      output: string,
      options: CommandOptions<'report'>,
    ) => {
      const result = await commandHandler.command(
        Cmd.report,
        [parameters, output],
        Object.assign({}, options, program.opts()),
      );
      handleResponse(result);
    },
  );
}
