// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { type Command } from 'commander';

import { type Workspace, Validate } from '@cyberismo/data-handler';

import { CommandWithPath } from '../lib/args.js';
import { onProject } from '../lib/errors.js';
import { printResult } from '../lib/output.js';
import type { ValidateCommandOptions } from '../options.js';

// The project's validation errors, or 'Project structure validated'.
export async function validation(ws: Workspace): Promise<string> {
  const result = await Validate.getInstance().validateWorkspace(ws);
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
