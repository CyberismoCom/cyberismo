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
import { appendFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { localFolder } from '@cyberismo/data-handler';

import { createApp } from '../../backend/src/app.js';
import { MockAuthProvider } from '../../backend/src/auth/mock.js';
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
  vi.unstubAllEnvs();
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

  it('says git is required when git is not installed', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'cyberismo-no-git-'));
    env.PATH = empty;

    const output = await run(['create', 'project', 'Gitless', 'gitl', 'gl']);
    await rm(empty, { recursive: true, force: true });

    expect(output.code).toBe(1);
    expect(output.stderr.trim()).toBe(
      'git is required to create a project, but it was not found. Install git and make sure it is on PATH.',
    );
  }, 60_000);

  it('creates a project at a path under the home folder', async () => {
    env.HOME = folder;

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

  // 'project' creates at '-p'; a projects resource name is no resource type.
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

describe('the CLI and the backend', () => {
  const params = {
    name: 'Golden Project',
    prefix: 'gold',
    category: 'Testing',
    description: 'A golden project',
  };

  // POST /api/projects in this process as Ann, the CLI's git user; with the
  // CLI's git configuration, offline.
  async function postProject(autocommit: boolean, skipDefaultHub = false) {
    for (const [name, value] of Object.entries(env)) {
      vi.stubEnv(name, value);
    }
    const root = join(folder, 'server');
    await mkdir(root);
    const { directory } = await localFolder(root, { autocommit });
    const app = createApp(
      new MockAuthProvider({ name: 'Ann', email: 'ann@example.com' }),
      directory,
      undefined,
      undefined,
      root,
    );
    const response = await app.request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...params, skipDefaultHub }),
    });
    return {
      status: response.status,
      body: await response.json(),
      created: await snapshot(join(root, 'gold')),
    };
  }

  async function createWithCli(options: string[]) {
    const output = await run([
      ...options.filter((option) => option === '--autocommit'),
      'create',
      'project',
      params.name,
      params.prefix,
      join('cli', 'gold'),
      params.category,
      params.description,
      ...options.filter((option) => option !== '--autocommit'),
    ]);
    return { output, created: await snapshot(join(folder, 'cli', 'gold')) };
  }

  // Only the CLI logs to the project.
  async function snapshot(path: string) {
    const { files, ...rest } = await projectSnapshot(path);
    return {
      files: Object.fromEntries(
        Object.entries(files).filter(([name]) => !name.startsWith('.logs/')),
      ),
      ...rest,
    };
  }

  it.each([
    ['by default', [], false],
    ['with autocommit', ['--autocommit'], true],
    ['skipping the default hub', ['-s'], false],
  ])(
    'create the same project %s',
    async (_, options, autocommit) => {
      const cli = await createWithCli(options);
      const server = await postProject(autocommit, options.includes('-s'));

      expect(server.status).toBe(201);
      expect(cli.created).toEqual(server.created);
      expect(cli.created.commits).toContain(
        'Ann <ann@example.com> | Cyberismo Bot <bot@cyberismo.com> | Initial commit',
      );
    },
    60_000,
  );

  it('both report a default hub that could not be added', async () => {
    // Git refuses the hub's commit.
    const hooks = join(folder, 'hooks');
    await mkdir(hooks);
    await writeFile(
      join(hooks, 'commit-msg'),
      // simple-git takes a failure without stderr for a success.
      '#!/bin/sh\ngrep -q "^Add hub" "$1" || exit 0\necho refused >&2\nexit 1\n',
      { mode: 0o755 },
    );
    await appendFile(
      join(folder, 'gitconfig'),
      `[core]\n\thooksPath = ${hooks.replaceAll('\\', '/')}\n`,
    );

    const cli = await createWithCli(['--autocommit']);
    const server = await postProject(true);

    expect(server.status).toBe(201);
    expect(server.body.failures).toEqual([
      expect.stringMatching(/^Could not add default hub - /),
    ]);
    expect(server.body.warnings).toEqual([]);
    expect(cli.output).toEqual({
      code: 1,
      stdout: '',
      stderr: `${server.body.failures[0]}\n`,
    });
    expect(cli.created).toEqual(server.created);
  }, 60_000);
});
