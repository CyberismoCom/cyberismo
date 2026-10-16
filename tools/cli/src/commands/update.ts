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

import {
  Cmd,
  type CommandOptions,
  type UpdateOperations,
} from '@cyberismo/data-handler';

import { CommandWithPath } from '../lib/args.js';
import { commandHandler } from '../lib/dispatch.js';
import { handleResponse } from '../lib/output.js';

const additionalHelpForUpdate = `Sub-command help:
  update <resourceName> <operation> <key> <value> [newValue], where
      <resourceName> Resource name (e.g., myProject/cardTypes/myCard)
      <operation> Type of change: "add", "change", "rank", or "remove"
      <key> Property to change in resource
      <value> Current value (for change/remove) or value to add
      [newValue] New value when using "change" operation

  Special case - Workflow changes with state mapping:
    When changing a card type's workflow, you can provide a mapping file
    to automatically update cards' workflow states:

    cyberismo update myProject/cardTypes/myCard change workflow oldWorkflow newWorkflow --mapping-file mapping.json

    The mapping file should be JSON with this format:
    {
      "stateMapping": {
        "ExistingState1": "NewState1",
        "ExistingState2": "NewState2"
      }
    }

    If there are states that are skipped, a warning is produced.
    `;

export function registerUpdate(program: Command) {
  // Update command
  const updateCmd = new CommandWithPath('update').description(
    'Update resource details',
  );
  program.addCommand(updateCmd);
  updateCmd
    .argument('<resourceName>', 'Resource name')
    .argument(
      '<operation>',
      'Type of change, either "add", "change", "rank" or "remove" ',
    )
    .argument('<key>', 'Detail to be changed')
    .argument('<value>', 'Value for a detail')
    .argument(
      '[newValue]',
      'When using "change" define new value for detail.\nWhen using "remove" provide optional replacement value for removed value',
    )
    .option(
      '-m, --mapping-file <path>',
      'Path to JSON file containing workflow state mapping (only used when changing workflow)',
    )
    .addHelpText('after', additionalHelpForUpdate)
    .action(
      async (
        resourceName: string,
        operation: UpdateOperations,
        key: string,
        value: string,
        newValue: string,
        options: CommandOptions<'update'>,
      ) => {
        const result = await commandHandler.command(
          Cmd.update,
          [resourceName, operation, key, value, newValue],
          Object.assign({}, options, program.opts()),
        );
        handleResponse(result);
      },
    );
}
