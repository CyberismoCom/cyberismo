// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { type Command } from 'commander';

import { type Workspace } from '@cyberismo/data-handler';

import { CommandGroup } from '../lib/args.js';
import { fail, onProject } from '../lib/errors.js';
import { printResult } from '../lib/output.js';
import type { FetchCommandOptions } from '../options.js';

// Fetches every hub, even with a current cache; gives the failure text if
// some hub could not be read.
async function fetchHubs(ws: Workspace): Promise<string | undefined> {
  const failures = await ws.modules.fetchHubs(true);
  if (failures.length === 0) {
    return undefined;
  }
  return [
    ...failures.map((failure) => `${failure.location}: ${failure.message}`),
    'Modules from the hubs that could be read were refreshed.',
  ].join('\n');
}

export function registerFetch(program: Command) {
  const fetchCmd = new CommandGroup('fetch').description(
    'Retrieve external data to local file system.',
  );
  program.addCommand(fetchCmd);

  fetchCmd
    .command('hubs')
    .description('Retrieves module lists from hubs')
    .action(async (options: FetchCommandOptions) => {
      const failure = await onProject(
        Object.assign({}, options, program.opts()),
        fetchHubs,
      );
      if (failure) {
        fail(failure);
      }
      printResult();
    });
}
