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
import { describe, expect, it } from 'vitest';

import { ConfigurationLogger } from '../../../src/infra/replay-log/configuration-logger.js';
import { edit, projects, remove, rename, spec } from './fixture.js';

const open = projects();

type Opened = Awaited<ReturnType<typeof open>>;
const level = 'test/fieldTypes/level';
const flow = 'test/workflows/flow';

const lastSubject = async (path: string) =>
  (
    await promisify(execFile)('git', ['log', '-1', '--format=%s'], {
      cwd: path,
    })
  ).stdout.trim();
const logged = async (path: string) =>
  (await ConfigurationLogger.entries(path)).map(
    ({ operation, target }) => `${operation} ${target}`,
  );

describe('what a resource change records', () => {
  const changes: {
    change: string;
    apply: (o: Opened) => Promise<unknown>;
    subject: string;
    // The configuration log entry the change leaves for consumers, if any.
    entry?: string;
  }[] = [
    {
      change: 'a create',
      apply: ({ ws }) =>
        ws.resources.create('x', 'fieldTypes', { dataType: 'integer' }),
      subject: 'Create field type x',
    },
    {
      change: 'an edit of a display name',
      apply: ({ ws }) =>
        edit(ws, flow, 'displayName', { name: 'change', to: 'Flow' }),
      subject: `Update ${flow}`,
    },
    {
      change: 'an edit that removes an enum value',
      apply: ({ ws }) =>
        edit(ws, level, 'enumValues', {
          name: 'remove',
          target: { enumValue: 'low' },
        }),
      subject: `Update ${level}`,
      entry: `resource_update ${level}`,
    },
    {
      change: 'an edit that renames an enum value',
      apply: ({ ws }) =>
        edit(ws, level, 'enumValues', {
          name: 'change',
          target: { enumValue: 'low' },
          to: { enumValue: 'lowest' },
        }),
      subject: `Update ${level}`,
      entry: `resource_update ${level}`,
    },
    {
      change: 'a rename',
      apply: ({ ws }) => rename(ws, 'test/calculations/calc', 'sum'),
      subject: 'Rename test/calculations/calc to sum',
      entry: 'resource_rename test/calculations/calc',
    },
    {
      change: 'a delete',
      apply: ({ ws }) => remove(ws, 'test/calculations/calc'),
      subject: 'Delete test/calculations/calc',
      entry: 'resource_delete test/calculations/calc',
    },
  ];

  it.each(changes)(
    '$change is one commit under autocommit, and is logged only when consumers must know',
    async ({ apply, subject, entry }) => {
      const opened = await open({ ...spec, git: true }, { autocommit: true });

      await apply(opened);

      expect(await lastSubject(opened.path)).toBe(subject);
      expect(await logged(opened.path)).toEqual(entry ? [entry] : []);
    },
  );
});
