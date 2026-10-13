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
  resourceName,
  type CommandOptions,
  type Workspace,
} from '@cyberismo/data-handler';

import { CommandWithPath, ResourceTypeParser as Parser } from '../lib/args.js';
import { commandHandler, program } from '../lib/dispatch.js';
import { onProject } from '../lib/errors.js';
import { deprecationNote, handleResponse, printJson } from '../lib/output.js';

// Card reads of 'show'; a resource name '<prefix>/cards/<x>' shows card <x>.
const cardReads = new Map<string, (ws: Workspace, detail: string) => unknown>([
  ['attachments', (ws) => ws.cards.attachments()],
  ['card', (ws, detail) => ws.cards.details(detail)],
  ['cards', (ws) => ws.cards.list()],
  ['labels', (ws) => ws.cards.labels()],
]);

export async function showAction(
  type: string,
  typeDetail: string | undefined,
  options: CommandOptions<'show'>,
) {
  if (type === '') {
    return;
  }
  const resource = resourceName(type);
  const cardRead = cardReads.get(resource.type.slice(0, -1) || type);
  if (cardRead) {
    const detail = (resource.type ? type : typeDetail) || '';
    const result = await onProject(
      Object.assign({}, options, program.opts()),
      async (ws) => (await cardRead(ws, detail)) as object,
    );
    // By default, do not show the card's content
    if (!options.details && 'content' in result) {
      delete (result as { content?: unknown }).content;
    }
    printJson(result);
  } else {
    const result = await commandHandler.command(
      Cmd.show,
      [type, typeDetail!],
      Object.assign({}, options, program.opts()),
    );
    // By default, do not show resources' content files
    if (!options.details) {
      if (
        typeof result.payload === 'object' &&
        result.payload !== null &&
        'content' in result.payload
      ) {
        delete (result.payload as { content?: unknown }).content;
      }
    }
    handleResponse(result);
  }
}

export function registerShow(program: Command) {
  // Show command
  const showCmd = new CommandWithPath('show').description(
    'Shows details from a project',
  );
  program.addCommand(showCmd);
  showCmd
    .argument(
      '<type>',
      `details can be seen from: ${Parser.listTargets('show')
        .filter((type) => type !== 'modules')
        .join(', ')}`,
      Parser.parseShowTypes,
    )
    .argument(
      '[typeDetail]',
      'additional information about the requested type; for example a card key',
    )
    .option(
      '-d --details',
      'Certain types (such as cards) can have additional details',
    )
    .option(
      '-a --showAll',
      'Show all modules, irregardless if it has been imported or not. Only with "show importableModules"',
    )
    .option(
      '-u --show-use',
      'Show where resource is used. Only used with resources, otherwise will be ignored.',
    )
    .action(
      async (type: string, typeDetail, options: CommandOptions<'show'>) => {
        if (type === 'modules') {
          deprecationNote('show modules', 'module list');
        }
        await showAction(type, typeDetail, options);
      },
    );
}
