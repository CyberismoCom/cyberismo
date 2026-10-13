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

import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { type Command } from 'commander';

import {
  CardNotFoundError,
  type CommandOptions,
} from '@cyberismo/data-handler';
import { UserPreferences } from '@cyberismo/data-handler/utils/user-preferences';

import { CommandWithPath } from '../lib/args.js';
import { onProject } from '../lib/errors.js';
import { printResult } from '../lib/output.js';

// Opens the card's content and metadata files in the editor of cards.prefs.json.
export async function editCard(cardPath: string) {
  // Read the user preferences
  const prefs = new UserPreferences(
    join(homedir(), '.cyberismo', 'cards.prefs.json'),
  ).getPreferences();

  // Construct paths for the card components (json and adoc)
  const cardContentPath = join(cardPath, 'index.adoc');
  const cardJsonPath = join(cardPath, 'index.json');

  // Extract the editor settings from the preferences.
  const editorPrefs = prefs.editCommand[process.platform];
  const editorCommand = editorPrefs.command;
  const editorArgPrefs: string[] = editorPrefs.args; // Coarces the args to string[] for map() below

  // Poor man's handlebars/moustache replacements
  const editorArgs = editorArgPrefs.map((arg) => {
    arg = arg.replace(/\{\{\s*cardContentPath\s*\}\}/, cardContentPath);
    arg = arg.replace(/\{\{\s*cardJsonPath\s*\}\}/, cardJsonPath);
    arg = arg.replace(/\{\{\s*cardDirPath\s*\}\}/, cardPath);

    return arg;
  });

  // Execute the editor synchronously and set it to inherit the parent process stdio.
  // This enables terminal editors such as vim to grab the screen I/O
  // from the command line cards process.
  const result = spawnSync(editorCommand, editorArgs, {
    stdio: 'inherit',
  });

  if (result.status === null) {
    throw new Error(`Cannot launch editor: ${result.error}`);
  }
}

export function registerEdit(program: Command) {
  // Edit command
  const editCmd = new CommandWithPath('edit')
    .description('Edit a card')
    .argument('<cardKey>', 'Card key of card');
  program.addCommand(editCmd);
  editCmd.action(async (cardKey: string, options: CommandOptions<'edit'>) => {
    await onProject(Object.assign({}, options, program.opts()), async (ws) => {
      // details refuses an empty key with its own message; edit never did.
      if (!cardKey) throw new CardNotFoundError(cardKey);
      await editCard((await ws.cards.details(cardKey)).path);
    });
    printResult();
  });
}
