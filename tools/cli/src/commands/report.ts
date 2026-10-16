// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { writeFile } from 'node:fs/promises';

import { type Command } from 'commander';
import { readJsonFile } from '@cyberismo/data-handler/utils/json';
import type { Context } from '@cyberismo/model';

import { CommandWithPath, contextOption } from '../lib/args.js';
import { onProject } from '../lib/errors.js';
import { printResult } from '../lib/output.js';
import type { ReportCommandOptions } from '../options.js';

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
      options: ReportCommandOptions,
    ) => {
      const report = await onProject(
        Object.assign({}, options, program.opts()),
        async (ws) => {
          const parametersFile = await readJsonFile(parameters);
          const result = await ws.queries.runReport(
            parametersFile.name,
            parametersFile.parameters,
            (options.context || 'commandLine') as Context,
          );
          if (output) {
            try {
              await writeFile(output, result, 'utf-8');
            } catch (error) {
              if (error instanceof Error) {
                throw new Error(
                  `Failed to write report to ${output}: ${error.message}`,
                  { cause: error },
                );
              }
            }
            return '';
          }
          return result || 'No report results';
        },
      );
      printResult(report);
    },
  );
}
