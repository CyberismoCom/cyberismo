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
  scanForProjects,
  errorFunction,
} from '@cyberismo/data-handler';

import { CommandWithPath } from '../lib/args.js';
import { program } from '../lib/program.js';
import { openWorkspace } from '../lib/open.js';
import { confirm } from '../lib/prompts.js';
import { validation } from './validate.js';
import type { StartCommandOptions } from '../options.js';

async function getGitUserConfig(): Promise<MockUserConfig> {
  const git = simpleGit();
  const name = (await git.getConfig('user.name')).value || undefined;
  const email = (await git.getConfig('user.email')).value || undefined;
  return { name, email };
}

// Validates each project and returns the ones with errors.
async function validateProjects(
  projects: Awaited<ReturnType<typeof scanForProjects>>,
  options: StartCommandOptions,
): Promise<ProjectErrors[]> {
  const invalid: ProjectErrors[] = [];
  for (const project of projects) {
    // A project that cannot be opened reports why as its errors.
    const result = await openWorkspace(
      Object.assign({}, options, program.opts(), {
        projectPath: project.path,
      }),
    ).then(validation, errorFunction);
    const message =
      result ||
      program.error(
        `Expected validation result for project '${project.name}', but got none`,
      );
    if (message !== 'Project structure validated') {
      invalid.push({ prefix: project.prefix, errors: message.split('\n') });
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
    let projects: Awaited<ReturnType<typeof scanForProjects>>;
    try {
      projects = await scanForProjects(basePath);
    } catch (error) {
      program.error(
        error instanceof Error
          ? error.message
          : `Failed to scan for projects in '${basePath}'`,
      );
      return;
    }

    // Single-project mode: basePath is itself a project (not a collection)
    const isSingleProject =
      projects.length === 1 && projects[0].path === resolve(basePath);

    if (projects.length === 0) {
      console.log('No projects found. Starting with empty project collection.');
    }

    const invalid = await validateProjects(projects, options);
    if (invalid.length > 0) {
      console.error(formatProjectErrors(invalid));
      const userConfirmation = await confirm(
        {
          message: `${invalid.length} of ${projects.length} projects have validation errors. Start anyway?`,
        },
        { signal: AbortSignal.timeout(10000), clearPromptOnDone: true },
      ).catch((error) => {
        return error.name === 'AbortPromptError';
      });
      if (!userConfirmation) {
        return;
      }
    }

    const gitUser = await getGitUserConfig();
    if (!gitUser.name || !gitUser.email) {
      console.warn(
        'Warning: git user.name or user.email is not configured. Using defaults.',
      );
    }

    // Open each discovered project
    const mergedOptions = Object.assign({}, options, program.opts());
    // Load failures were already reported by validateProjects above.
    const { directory } = await localFolder(basePath, {
      autocommit: mergedOptions.autocommit,
      autopush: mergedOptions.autopush,
      watchResourceChanges: mergedOptions.watchResourceChanges,
    });

    // Pass multiProjectRoot only in multi-project mode (enables project creation)
    await startServer(
      new MockAuthProvider(gitUser),
      directory,
      true,
      isSingleProject ? undefined : basePath,
    );
  });
}
