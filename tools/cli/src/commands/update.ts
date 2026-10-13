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
  resourceName,
  resourceNameToString,
  type CommandOptions,
  type UpdateCommandOptions,
  type Workspace,
} from '@cyberismo/data-handler';
import { errorFunction } from '@cyberismo/data-handler/utils/error-utils';
import { resolveTilde } from '@cyberismo/data-handler/utils/file-utils';
import { readJsonFile } from '@cyberismo/data-handler/utils/json';
import type { Operation, UpdateKey, UpdateOperations } from '@cyberismo/model';

import { CommandWithPath } from '../lib/args.js';
import { onProject } from '../lib/errors.js';
import { cleanNote, printResultWithNote } from '../lib/output.js';

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
        const note = await onProject(
          Object.assign({}, options, program.opts()),
          (ws) =>
            update(
              ws,
              [resourceName, operation, key, value, newValue],
              options,
            ),
        );
        printResultWithNote(note);
      },
    );
}

// Applies the edit; returns the clean note when it may have left values.
async function update(
  ws: Workspace,
  args: string[],
  options: UpdateCommandOptions,
): Promise<string | undefined> {
  const [resource, operation, key, value, newValue] = args;
  let parsedValue: unknown;
  try {
    parsedValue = JSON.parse(value);
  } catch {
    parsedValue = value;
  }

  // Handle mapping file for workflow changes
  let mappingTable: { stateMapping: Record<string, string> } | undefined;
  if (
    (options as UpdateCommandOptions).mappingFile &&
    operation === 'change' &&
    key === 'workflow'
  ) {
    try {
      const mappingData = await readJsonFile(
        resolveTilde((options as UpdateCommandOptions).mappingFile!),
      );
      if (
        mappingData &&
        typeof mappingData === 'object' &&
        'stateMapping' in mappingData
      ) {
        mappingTable = mappingData as {
          stateMapping: Record<string, string>;
        };
      } else {
        throw new Error('Mapping file must contain a "stateMapping" object');
      }
    } catch (error) {
      throw new Error(`Failed to read mapping file: ${errorFunction(error)}`, {
        cause: error,
      });
    }
  }

  let parsedNewValue = newValue;
  if (newValue) {
    try {
      parsedNewValue = JSON.parse(newValue);
    } catch {
      parsedNewValue = newValue;
    }
  }

  const target = resourceName(resource);
  await ws.changes.apply({
    kind: 'edit',
    target,
    updateKey: parseUpdateKey(key),
    operation: buildOperation(
      operation as UpdateOperations,
      parsedValue,
      parsedNewValue,
      mappingTable,
    ),
  });

  // Dropping or replacing a custom field leaves the cards' values in
  // place; only those two operations can create something to clean.
  if (
    target.type === 'cardTypes' &&
    key === 'customFields' &&
    (operation === 'remove' || operation === 'change')
  ) {
    return cleanNote(ws, resourceNameToString(target));
  }
}

// Builds the discriminated update operation from the CLI's flat
// (operation, value, newValue) arguments. A 'change' without newValue sets a
// scalar: 'to' carries the value and 'target' is unused.
function buildOperation(
  operation: UpdateOperations,
  value: unknown,
  newValue: unknown,
  mappingTable?: { stateMapping: Record<string, string> },
): Operation<unknown> {
  switch (operation) {
    case 'add':
      return { name: 'add', target: value };
    case 'change':
      return {
        name: 'change',
        target: newValue ? value : undefined,
        to: newValue ? newValue : value,
        ...(mappingTable && { mappingTable }),
      };
    case 'rank':
      return { name: 'rank', target: value, newIndex: newValue as number };
    case 'remove':
      return {
        name: 'remove',
        target: value,
        replacementValue: newValue ? newValue : undefined,
      };
  }
}

function parseUpdateKey(key: string): UpdateKey {
  const splitKey = key.split('/');
  if (splitKey.length !== 1 && splitKey.length !== 2) {
    throw new Error(
      `Invalid key format: ${key}. Use 'property' or 'content/<property>'.`,
    );
  }
  if (splitKey.length === 2 && splitKey[0] !== 'content') {
    throw new Error(
      `Invalid key format: ${key}. When using 'content', always use as 'content/<property>'.`,
    );
  }
  const [parsedKey, subKey] = splitKey;
  return subKey === undefined ? { key: parsedKey } : { key: 'content', subKey };
}
