// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import type { Command } from 'commander';

import installScript from '../install.sh' with { type: 'text' };

// Same layout as install.sh: one directory per build, named pr-<number>-<commit>
// or main-<commit>.
const versionsDir = join(
  process.env.CYBERISMO_DEV_HOME ?? join(homedir(), '.cyberismo-dev'),
  'versions',
);

function installedBuilds(): string[] {
  if (!existsSync(versionsDir)) return [];
  return readdirSync(versionsDir)
    .filter((name) => /^(pr-\d+|main)-/.test(name))
    .sort();
}

/** The builds of a pull request number, or of `main`. */
function buildsOf(target: string): string[] {
  const prefix = target === 'main' ? 'main-' : `pr-${target}-`;
  return installedBuilds().filter((name) => name.startsWith(prefix));
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
      'Switch to the CI build of a pull request or of main, downloading it if needed. Needs the GitHub CLI (gh).',
    )
    .argument('[target]', 'Pull request number, or main', 'main')
    .action((target: string) => {
      const result = spawnSync('sh', ['-s', '--', target], {
        input: installScript,
        stdio: ['pipe', 'inherit', 'inherit'],
      });
      if (result.error) throw result.error;
      process.exitCode = result.status ?? 1;
    });

  self
    .command('run')
    .description(
      'Run a downloaded build once without making it active, e.g. `self run 1234 -- app --port 3001`',
    )
    .argument('<target>', 'Pull request number, or main')
    .argument('[args...]', 'Arguments for that build; put them after --')
    .action((target: string, args: string[]) => {
      const build = buildsOf(target).at(-1);
      if (!build) {
        program.error(
          `no build of ${target} is downloaded; get it with: cyberismo-dev self install ${target}`,
        );
      }
      const result = spawnSync(
        join(versionsDir, build, 'cyberismo-dev'),
        args,
        {
          stdio: 'inherit',
        },
      );
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
    .description('Remove the downloaded builds of a pull request or of main')
    .argument('<target>', 'Pull request number, or main')
    .action((target: string) => {
      const builds = buildsOf(target);
      if (builds.includes(active)) {
        program.error(
          `${active} is the active build; switch to another one first`,
        );
      }
      if (builds.length === 0) console.log(`no builds of ${target}`);
      removeBuilds(builds);
    });

  self
    .command('prune')
    .description('Remove all downloaded builds except the active one')
    .action(() => {
      removeBuilds(installedBuilds().filter((build) => build !== active));
    });
}
