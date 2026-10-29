// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { type Command } from 'commander';

import { renameProject } from '@cyberismo/data-handler';

import { CommandWithPath } from '../lib/args.js';
import { onProject } from '../lib/errors.js';
import { printResultWithNote } from '../lib/output.js';
import type { RenameCommandOptions } from '../options.js';

export function registerRename(program: Command) {
  // Rename command
  const renameCmd = new CommandWithPath('rename')
    .description(
      'Change project prefix and rename all the content with the new prefix. Only possible before the project has published a version, unless --force is given',
    )
    .argument('<to>', 'New project prefix')
    .option(
      '--force',
      'Rename even though a version has been published; the next version is then a new module',
    );
  program.addCommand(renameCmd);
  renameCmd.action(async (to: string, options: RenameCommandOptions) => {
    const note = await onProject(
      Object.assign({}, options, program.opts()),
      async (ws) => {
        const published = (await ws.settings.info()).version;
        await renameProject(ws, to, { force: options.force });
        return published
          ? `Version ${published} was published under the old prefix. The ` +
              `next version you publish is a new module: consumers must ` +
              `install it and remove the old one rather than update.`
          : undefined;
      },
    );
    printResultWithNote(note);
  });
}
