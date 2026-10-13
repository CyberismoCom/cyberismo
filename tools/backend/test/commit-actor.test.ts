/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.

  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { type Workspace } from '@cyberismo/data-handler';
import { createApp } from '../src/app.js';
import { ProjectRegistry } from '../src/project-registry.js';
import { UserRole, type UserInfo } from '../src/types.js';
import {
  buildProject,
  type BuiltProject,
} from '../../data-handler/test/helpers/project-builder.js';
import { openTestWorkspace } from './helpers/open-test-workspace.js';

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
  ws.checkout.dispose();
  await project.cleanup();
});

test('a REST write is committed as the user and records the user as actor', async () => {
  const app = createApp(
    { authenticate: async () => user },
    ProjectRegistry.fromCheckout(ws.checkout),
  );
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
  expect(stdout.trim().split('\n')).toEqual([
    'Dana Editor <dana@example.com>',
    'Cyberismo-Actor: user:dana-1',
  ]);
});
