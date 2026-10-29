// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { type Workspace } from '@cyberismo/data-handler';
import { createApp } from '../src/app.js';
import { UserRole, type UserInfo } from '../src/types.js';
import {
  buildProject,
  type BuiltProject,
} from '../../data-handler/test/helpers/project-builder.js';
import {
  openTestWorkspace,
  directoryOf,
} from './helpers/open-test-workspace.js';

const user: UserInfo = {
  id: 'dana-1',
  email: 'dana@example.com',
  name: 'Dana Editor',
  role: UserRole.Editor,
};

let project: BuiltProject;
let ws: Workspace;

beforeEach(async () => {
  project = await buildProject({ git: true, cards: [{ title: 'Alpha' }] });
  ws = await openTestWorkspace(project.path, { autocommit: true });
});

afterEach(async () => {
  await project.cleanup();
});

test('a REST write is committed as the user', async () => {
  const app = createApp({ authenticate: async () => user }, directoryOf(ws));
  const response = await app.request(
    `/api/projects/test/cards/${project.keys[0]}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metadata: { labels: ['urgent'] } }),
    },
  );
  expect(response.status).toBe(200);

  const { stdout } = await promisify(execFile)(
    'git',
    ['log', '-1', '--format=%an <%ae>%n%(trailers:only,unfold)'],
    { cwd: project.path },
  );
  expect(stdout.trim().split('\n')).toEqual(['Dana Editor <dana@example.com>']);
});
