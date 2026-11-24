// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { spawnSync } from 'node:child_process';

import type { Command } from 'commander';

import installScript from '../install.sh' with { type: 'text' };

/**
 * Adds `self install <pr>`, which replaces this binary with the build of a
 * pull request by running the embedded install script.
 * @param program The CLI program to extend.
 * @param buildId Identifier of the running build.
 */
export function registerSelf(program: Command, buildId: string) {
  program
    .command('self')
    .description(`Manage this cyberismo-dev installation (build ${buildId})`)
    .command('install')
    .description(
      'Replace this binary with the CI build of a pull request. Needs the GitHub CLI (gh).',
    )
    .argument('<pr>', 'Pull request number')
    .action((pr: string) => {
      const result = spawnSync('sh', ['-s', '--', pr], {
        input: installScript,
        stdio: ['pipe', 'inherit', 'inherit'],
      });
      if (result.error) throw result.error;
      process.exitCode = result.status ?? 1;
    });
}
