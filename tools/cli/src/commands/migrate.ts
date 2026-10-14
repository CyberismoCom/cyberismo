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

import { migrateProject } from '@cyberismo/data-handler';
import { errorFunction } from '@cyberismo/data-handler/utils/error-utils';

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
