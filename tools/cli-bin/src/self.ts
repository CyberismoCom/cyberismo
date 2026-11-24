// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import type { Command } from 'commander';

import installScript from '../install.sh' with { type: 'text' };

// Same layout as install.sh: one directory per build, named pr-<number>-<commit>.
const versionsDir = join(
  process.env.CYBERISMO_DEV_HOME ?? join(homedir(), '.cyberismo-dev'),
  'versions',
);

function installedBuilds(): string[] {
  if (!existsSync(versionsDir)) return [];
  return readdirSync(versionsDir)
    .filter((name) => name.startsWith('pr-'))
    .sort();
}

function removeBuilds(builds: string[]) {
  for (const build of builds) {
    rmSync(join(versionsDir, build), { recursive: true, force: true });
    console.log(`removed ${build}`);
  }
}

/**
 * Adds the `self` commands, which manage the installed pull request builds.
 * @param program The CLI program to extend.
 * @param buildId Identifier of the running build.
 */
export function registerSelf(program: Command, buildId: string) {
  // The directory this binary runs from; it is the active build.
  const active = basename(dirname(realpathSync(process.execPath)));

  const self = program
    .command('self')
    .description(`Manage this cyberismo-dev installation (build ${buildId})`);

  self
    .command('install')
    .description(
      'Switch to the CI build of a pull request, downloading it if needed. Needs the GitHub CLI (gh).',
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

  self
    .command('list')
    .description('List the downloaded builds')
    .action(() => {
      for (const build of installedBuilds()) {
        console.log(build === active ? `${build} (active)` : build);
      }
    });

  self
    .command('remove')
    .description('Remove the downloaded builds of a pull request')
    .argument('<pr>', 'Pull request number')
    .action((pr: string) => {
      const builds = installedBuilds().filter((build) =>
        build.startsWith(`pr-${pr}-`),
      );
      if (builds.includes(active)) {
        program.error(
          `${active} is the active build; switch to another one first`,
        );
      }
      if (builds.length === 0) console.log(`no builds of pull request ${pr}`);
      removeBuilds(builds);
    });

  self
    .command('prune')
    .description('Remove all downloaded builds except the active one')
    .action(() => {
      removeBuilds(installedBuilds().filter((build) => build !== active));
    });
}
