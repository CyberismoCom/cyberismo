// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { spawnSync } from 'node:child_process';

import type { Command } from 'commander';

import installScript from '../install.sh' with { type: 'text' };

/**
 * Adds `self install`, which switches this installation to another build by
 * running the embedded install script.
 * @param program The CLI program to extend.
 * @param buildId Identifier of the running build.
 */
export function registerSelf(program: Command, buildId: string) {
  const self = program
    .command('self')
    .description(`Manage this cyberismo-dev installation (build ${buildId})`);

  self
    .command('install')
    .description(
      'Download a CI build and make it the active cyberismo-dev. Defaults to the latest build of main. Needs the GitHub CLI (gh).',
    )
    .option('--pr <number>', 'Latest successful build of a pull request')
    .option('--branch <name>', 'Latest successful build of a branch')
    .option('--run <id>', 'Build of a specific workflow run')
    .action((options: { pr?: string; branch?: string; run?: string }) => {
      const args = Object.entries(options).flatMap(([name, value]) => [
        `--${name}`,
        value,
      ]);
      const result = spawnSync('sh', ['-s', '--', ...args], {
        input: installScript,
        stdio: ['pipe', 'inherit', 'inherit'],
      });
      if (result.error) throw result.error;
      process.exitCode = result.status ?? 1;
    });
}
