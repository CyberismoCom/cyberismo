// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { type Command } from 'commander';

import { migrateProject, errorFunction } from '@cyberismo/data-handler';

import { pathGuideline } from '../lib/args.js';
import { fail } from '../lib/errors.js';
import { projectPathOf } from '../lib/open.js';
import { printResult } from '../lib/output.js';
import type { MigrateCommandOptions } from '../options.js';

export function registerMigrate(program: Command) {
  // Migrate command
  program
    .command('migrate')
    .description('Migrate project schema to the latest version.')
    .option('-p, --project-path [path]', `${pathGuideline}`)
    .action(async (options: MigrateCommandOptions) => {
      // The project is not opened: its schema may be one opening refuses.
      try {
        printResult(
          await migrateProject(
            projectPathOf(Object.assign({}, options, program.opts())),
          ),
        );
      } catch (error) {
        fail(errorFunction(error));
      }
    });
}
