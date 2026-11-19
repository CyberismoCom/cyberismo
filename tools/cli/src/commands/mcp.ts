// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { type Command } from 'commander';

import { formatProjectErrors } from '@cyberismo/model';
import { localFolder } from '@cyberismo/data-handler';
import { resolveTilde } from '@cyberismo/data-handler/utils/file-utils';
import { serveStdio, type McpUser } from '@cyberismo/mcp';

import { CommandWithPath } from '../lib/args.js';
import { gitUser } from '../lib/git-user.js';
import type { StartCommandOptions } from '../options.js';

// The local user. Name and email default as in `cyberismo app`.
const LOCAL_USER_ID = 'local-user';
const DEFAULT_NAME = 'Local Admin';
const DEFAULT_EMAIL = 'admin@cyberismo.local';

// Standard output carries the protocol, and each line there must be a protocol
// message. Send the console output of all packages to standard error.
function keepStdoutForProtocol() {
  const toStderr = (...args: unknown[]) => console.error(...args);
  console.log = toStderr;
  console.info = toStderr;
  console.debug = toStderr;
  console.warn = toStderr;
}

export function registerMcp(program: Command) {
  // Serves the MCP server over stdio. An MCP client, such as Claude Code,
  // starts this command as a child process. No prompts: standard input
  // carries the protocol.
  const mcpCmd = new CommandWithPath('mcp')
    .description(
      'Serves the MCP server over stdio, without the app. An AI agent starts it as a child process',
    )
    .option(
      '-w, --watch-resource-changes',
      'Project watches changes in .cards folder resources',
    );
  program.addCommand(mcpCmd);
  mcpCmd.action(async (options: StartCommandOptions) => {
    keepStdoutForProtocol();
    // An MCP client starts the command without a shell, so a '~' in the path
    // arrives as it is. Expand it once for all uses of the path.
    const basePath = resolveTilde(options.projectPath || process.cwd());
    const mergedOptions = Object.assign({}, options, program.opts());

    let opened: Awaited<ReturnType<typeof localFolder>>;
    try {
      opened = await localFolder(basePath, {
        autocommit: mergedOptions.autocommit,
        autopush: mergedOptions.autopush,
        watchResourceChanges: mergedOptions.watchResourceChanges,
      });
    } catch (error) {
      program.error(
        error instanceof Error
          ? error.message
          : `Failed to scan for projects in '${basePath}'`,
      );
      return;
    }
    const { directory, failed } = opened;
    if (failed.length > 0) {
      console.error(formatProjectErrors(failed));
    }
    if ((await directory.list()).length === 0) {
      console.error(`No projects found in '${basePath}'.`);
    }

    const git = await gitUser(basePath);
    const user: McpUser = {
      id: LOCAL_USER_ID,
      name: git.name ?? DEFAULT_NAME,
      email: git.email ?? DEFAULT_EMAIL,
      kind: 'user',
    };
    // The process ends when the client closes standard input.
    await serveStdio(directory, user);
  });
}
