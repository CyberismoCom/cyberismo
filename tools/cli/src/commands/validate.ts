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

import { type Workspace, Validate } from '@cyberismo/data-handler';

import { CommandWithPath } from '../lib/args.js';
import { onProject } from '../lib/errors.js';
import { printResult } from '../lib/output.js';
import type { ValidateCommandOptions } from '../options.js';

// The project's validation errors, or 'Project structure validated'.
export async function validation(ws: Workspace): Promise<string> {
  const result = await Validate.getInstance().validate(
    ws.path,
    () => ws.checkout,
  );
  return result.length ? result : 'Project structure validated';
}

export function registerValidate(program: Command) {
  // Validate command
  const validateCmd = new CommandWithPath('validate').description(
    'Validate project structure',
  );
  program.addCommand(validateCmd);
  validateCmd.action(async (options: ValidateCommandOptions) => {
    printResult(
      await onProject(Object.assign({}, options, program.opts()), validation),
    );
  });
}
