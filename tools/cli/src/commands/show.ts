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

import { type Workspace } from '@cyberismo/data-handler';

import {
  CommandWithPath,
  commandTarget,
  commandType,
  ResourceTypeParser as Parser,
  Resources,
} from '../lib/args.js';
import { program } from '../lib/program.js';
import { onProject } from '../lib/errors.js';
import { deprecationNote, printJson } from '../lib/output.js';
import type { ShowCommandOptions } from '../options.js';

// Card reads of 'show'; a resource name '<prefix>/cards/<x>' shows card <x>.
const cardReads = new Map<string, (ws: Workspace, detail: string) => unknown>([
  ['attachments', (ws) => ws.cards.attachments()],
  ['card', (ws, detail) => ws.cards.details(detail)],
  ['cards', (ws) => ws.cards.list()],
  ['labels', (ws) => ws.cards.labels()],
]);

// Resource and project reads of 'show', by the type the argument names.
function resourceRead(
  type: string,
  options: ShowCommandOptions,
): ((ws: Workspace, detail: string) => Promise<unknown>) | undefined {
  if (Resources.includes(type)) {
    return (ws, detail) =>
      ws.consistent(async () => {
        const shown = await ws.resources.show(detail);
        return options.showUse
          ? { ...shown, usedIn: await ws.resources.usage(detail) }
          : shown;
      });
  }
  if (Resources.some((resource) => `${resource}s` === type)) {
    return (ws) => ws.resources.list(type);
  }
  if (type === 'project') {
    return (ws) => ws.settings.info();
  }
  return undefined;
}

// Module and hub reads of 'show'; listings of hub data refresh it first.
function moduleRead(
  type: string,
  options: ShowCommandOptions,
): ((ws: Workspace, detail: string) => Promise<unknown>) | undefined {
  switch (type) {
    case 'importableModules':
      return async (ws) => {
        await ws.modules.ensureModuleListUpToDate();
        return ws.modules.importable(options?.showAll, options?.details);
      };
    case 'module':
      return (ws, detail) => ws.modules.show(detail);
    case 'hubs':
      return async (ws) => {
        await ws.modules.ensureModuleListUpToDate();
        return ws.modules.hubs();
      };
    case 'modules':
      return (ws) => ws.modules.list();
  }
  return undefined;
}

export async function showAction(
  type: string,
  typeDetail: string | undefined,
  options: ShowCommandOptions,
) {
  if (type === '') {
    return;
  }
  const target = commandType(type);
  const read =
    cardReads.get(target) ??
    resourceRead(target, options) ??
    moduleRead(target, options) ??
    (async () => {
      throw new Error(`Unknown or not yet handled type ${target}`);
    });
  const detail = commandTarget(type, typeDetail!) || '';
  const result = await onProject(
    Object.assign({}, options, program.opts()),
    async (ws) => (await read(ws, detail)) as object,
  );
  // By default, do not show the content of a card or of a resource
  if (!options.details && 'content' in result) {
    delete (result as { content?: unknown }).content;
  }
  printJson(result);
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
    .action(async (type: string, typeDetail, options: ShowCommandOptions) => {
      if (type === 'modules') {
        deprecationNote('show modules', 'module list');
      }
      await showAction(type, typeDetail, options);
    });
}
