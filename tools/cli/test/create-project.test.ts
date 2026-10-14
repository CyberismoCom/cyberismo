/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

// 'create project' end to end: output, created files and commits of the built
// binary, offline, outside any repository.

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildProject } from '../../data-handler/test/helpers/project-builder.js';
import {
  isolatedGitEnv,
  OFFLINE_EGRESS_PROXY,
  projectSnapshot,
} from '../../data-handler/test/helpers/project-snapshot.js';

const bin = join(import.meta.dirname, '..', 'bin', 'run');

let folder: string;
let env: NodeJS.ProcessEnv;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'cyberismo-create-project-'));
  env = {
    ...process.env,
    ...(await isolatedGitEnv(folder)),
    CYBERISMO_EGRESS_PROXY: OFFLINE_EGRESS_PROXY,
    NO_COLOR: '1',
    FORCE_COLOR: undefined,
    GIT_AUTHOR_NAME: undefined,
    GIT_AUTHOR_EMAIL: undefined,
  };
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

function run(args: string[], cwd = folder) {
  return new Promise<{ code: number; stdout: string; stderr: string }>(
    (resolve) => {
      execFile(
        process.execPath,
        [bin, ...args],
        { cwd, env },
        (error, stdout, stderr) => {
          const code = error ? Number(error.code) : 0;
          resolve({ code, stdout, stderr });
        },
      );
    },
  );
}

describe('create project', () => {
  it.each([
    ['without autocommit', []],
    ['with autocommit', ['--autocommit']],
    ['skipping module import', ['--skipModuleImport']],
    ['with autocommit, skipping module import', ['--autocommit', '-s']],
  ])(
    '%s',
    async (_, options) => {
      const output = await run([
        ...options.filter((option) => option === '--autocommit'),
        'create',
        'project',
        'Golden Project',
        'gold',
        'golden',
        'Testing',
        'A golden project',
        ...options.filter((option) => option !== '--autocommit'),
      ]);

      expect({
        output,
        ...(await projectSnapshot(join(folder, 'golden'))),
      }).toMatchSnapshot();
    },
    60_000,
  );

  it('creates a project at a path under the home folder', async () => {
    env.HOME = folder;
    env.USERPROFILE = folder;

    const output = await run([
      'create',
      'project',
      'Home',
      'home',
      '~/home',
      '-s',
    ]);

    expect(output.code).toBe(0);
    expect(existsSync(join(folder, 'home', 'cardRoot'))).toBe(true);
  }, 60_000);

  // As ever, at '-p' for 'project' and in the open project for a name.
  it.each([
    ['project', ['project', 'golden']],
    ['a projects resource name', ['gold/projects/golden', 'gold']],
  ])(
    'refuses a resource named as %s',
    async (_, args) => {
      const project = await buildProject({ prefix: 'gold' });
      try {
        expect(
          await run(['create', 'resource', ...args], project.path),
        ).toMatchSnapshot();
      } finally {
        await rm(project.path, { recursive: true, force: true });
      }
    },
    60_000,
  );

  it('refuses an invalid prefix, creating nothing', async () => {
    const output = await run(['create', 'project', 'Golden', 'G!', 'golden']);

    expect(output).toMatchSnapshot();
    expect(existsSync(join(folder, 'golden'))).toBe(false);
  }, 60_000);
});
