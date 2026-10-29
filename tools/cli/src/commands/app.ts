// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { resolve } from 'node:path';

import { type Command } from 'commander';
import { simpleGit } from 'simple-git';

import {
  MockAuthProvider,
  type MockUserConfig,
  startServer,
} from '@cyberismo/backend';
import { formatProjectErrors, type ProjectErrors } from '@cyberismo/model';
import {
  localFolder,
  SYSTEM_ACTOR,
  Validate,
  type ProjectDirectory,
} from '@cyberismo/data-handler';

import { CommandWithPath } from '../lib/args.js';
import { isProjectFolder } from '../lib/open.js';
import { confirm } from '../lib/prompts.js';
import { validation } from './validate.js';
import type { StartCommandOptions } from '../options.js';

async function getGitUserConfig(): Promise<MockUserConfig> {
  const git = simpleGit();
  const name = (await git.getConfig('user.name')).value || undefined;
  const email = (await git.getConfig('user.email')).value || undefined;
  return { name, email };
}

// The projects that fail to load or to validate, those first; a load
// failure is reported as the project's own error, and a folder whose name is
// invalid by that alone.
async function invalidProjects(
  directory: ProjectDirectory,
  failed: ProjectErrors[],
): Promise<ProjectErrors[]> {
  const invalid = failed.map(({ prefix, errors }) => ({
    prefix,
    errors: errors.map((error) =>
      error.replace(/^Failed to load project \(.*?\): /, ''),
    ),
  }));
  for (const { prefix } of await directory.list()) {
    const ws = await directory.open(prefix, SYSTEM_ACTOR);
    const message = Validate.validateFolder(ws.path)
      ? await validation(ws)
      : `Input validation error: folder name '${ws.path}' is invalid`;
    if (message !== 'Project structure validated') {
      invalid.push({ prefix, errors: message.split('\n') });
    }
  }
  return invalid;
}

export function registerApp(program: Command) {
  // Start app command.
  // If there are validation errors, user is prompted to continue or not.
  // There is 10 sec timeout on the prompt. If user does not reply, then
  // it is assumed that validation errors do not matter and application
  // start is resumed.
  const appCmd = new CommandWithPath('app')
    .description(
      'Starts the cyberismo app, accessible with a web browser at http://localhost:3000',
    )
    .option(
      '-w, --watch-resource-changes',
      'Project watches changes in .cards folder resources',
    )
    .option('--autocommit', 'Enable git-backed transactional writes')
    .option('--autopush', 'Push autocommitted changes to the remote');
  program.addCommand(appCmd);
  appCmd.action(async (options: StartCommandOptions) => {
    const basePath = options.projectPath || process.cwd();
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

    // Single-project mode: basePath is itself a project (not a collection)
    const isSingleProject = isProjectFolder(resolve(basePath));

    const projectCount = (await directory.list()).length + failed.length;
    if (projectCount === 0) {
      console.log('No projects found. Starting with empty project collection.');
    }

    const invalid = await invalidProjects(directory, failed);
    if (invalid.length > 0) {
      console.error(formatProjectErrors(invalid));
      const userConfirmation = await confirm(
        {
          message: `${invalid.length} of ${projectCount} projects have validation errors. Start anyway?`,
        },
        { signal: AbortSignal.timeout(10000), clearPromptOnDone: true },
      ).catch((error) => {
        return error.name === 'AbortPromptError';
      });
      if (!userConfirmation) {
        // The open projects' watchers would keep the process alive.
        process.exit();
      }
    }

    const gitUser = await getGitUserConfig();
    if (!gitUser.name || !gitUser.email) {
      console.warn(
        'Warning: git user.name or user.email is not configured. Using defaults.',
      );
    }

    // Pass multiProjectRoot only in multi-project mode (enables project creation)
    await startServer(
      new MockAuthProvider(gitUser),
      directory,
      true,
      isSingleProject ? undefined : basePath,
    );
  });
}
