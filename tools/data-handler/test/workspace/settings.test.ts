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

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, beforeEach, expect, it } from 'vitest';

import type { Checkout } from '../../src/containers/project.js';
import { openCheckout, Workspace } from '../../src/workspace/workspace.js';
import { buildProject, type BuiltProject } from '../helpers/project-builder.js';

const ann = {
  actor: { kind: 'user', id: 'ann', name: 'Ann' },
  identity: { name: 'Ann', email: 'ann@example.com' },
} as const;

let project: BuiltProject;
let checkout: Checkout;
let ws: Workspace;

beforeEach(async () => {
  project = await buildProject({
    git: true,
    prefix: 'abc',
    name: 'Alpha project',
  });
  checkout = await openCheckout(project.path, { autocommit: true });
  ws = Workspace.over(checkout, ann.actor, ann.identity);
});

afterEach(async () => {
  checkout.dispose();
  await project.cleanup();
});

async function commits(count: number): Promise<string[]> {
  const { stdout } = await promisify(execFile)(
    'git',
    ['log', `-${count}`, '--format=%s'],
    { cwd: project.path },
  );
  return stdout.trim().split('\n');
}

it('reads the project settings and path', async () => {
  expect(ws.path).toBe(project.path);
  expect(ws.settings.prefix).toBe('abc');
  expect(ws.settings.name).toBe('Alpha project');
  expect(await ws.settings.gitRemoteUrl()).toBe('');
  expect(await ws.settings.info()).toMatchObject({
    name: 'Alpha project',
    prefix: 'abc',
    path: project.path,
  });
});

it('reads back what the setters wrote, as one commit when atomic', async () => {
  await ws.atomic(async () => {
    await ws.settings.setName('Renamed');
    await ws.settings.setDescription('About it');
    await ws.settings.setCategory('Safety');
  }, 'Update project settings');

  expect([
    ws.settings.name,
    ws.settings.description,
    ws.settings.category,
  ]).toEqual(['Renamed', 'About it', 'Safety']);
  const [latest, previous] = await commits(2);
  expect(latest).toBe('Update project settings');
  expect(previous).not.toBe(latest);
});

it('commits a setter on its own under autocommit', async () => {
  await ws.settings.setDescription('About it');
  expect((await commits(1))[0]).toBe('Set project description');
});

it('rejects an invalid project name', async () => {
  await expect(ws.settings.setName('not valid!')).rejects.toThrow(/not valid/);
  expect(ws.settings.name).toBe('Alpha project');
});

it('sets and reads back the git remote URL', async () => {
  await ws.settings.setGitRemoteUrl('https://example.com/repo.git');
  expect(await ws.settings.gitRemoteUrl()).toBe('https://example.com/repo.git');
});
