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

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ConfigurationLogger,
  type ConfigurationOperation,
} from '../../../src/infra/replay-log/configuration-logger.js';
import type { Workspace } from '../../../src/api/workspace/workspace.js';
import type { BumpType } from '../../../src/domain/versions/version.js';
import { expectRefused, projects } from '../cards/fixture.js';
import { commitAll, gitLog, publishedVersion } from './fixture.js';
import { remove, rename } from '../resources/fixture.js';
import { checkoutOf } from '../../../src/infra/internal.js';

const open = projects();
const autocommit = { autocommit: true };

const spec = {
  version: '1.2.3',
  git: true,
  workflows: [{ name: 'flow' }],
  reports: { status: { content: 'status' } },
  cards: [{}],
};

const seals = (path: string) => {
  const folder = join(path, '.cards', 'local', 'migrations');
  return existsSync(folder)
    ? readdirSync(folder).filter((name) => name.startsWith('migrationLog_'))
    : [];
};

// The log a version 1.2.3 project carries into its next bump.
const log = (
  path: string,
  operation: string,
  target: string,
  parameters: Record<string, unknown> = {},
) =>
  ConfigurationLogger.log(path, {
    operation: operation as ConfigurationOperation,
    target,
    parameters,
  });

const field = 'test/fieldTypes/priority';
const removeEnumValue = {
  key: 'enumValues',
  operation: { name: 'remove', target: { enumValue: 'low' } },
};
const changeDataType = {
  key: 'dataType',
  operation: { name: 'change', target: 'shortText', to: 'integer' },
};

describe('versions.bump', () => {
  it.each([
    ['patch', '1.2.4'],
    ['minor', '1.3.0'],
    ['major', '2.0.0'],
  ] as const)(
    'a %s bump of 1.2.3 gives %s, in one commit',
    async (type, next) => {
      const { ws, path } = await open(spec, autocommit);

      const result = await ws.versions.bump(type);

      expect(result).toEqual({ previousVersion: '1.2.3', newVersion: next });
      expect(publishedVersion(path)).toBe(next);
      expect(checkoutOf(ws).configuration.version).toBe(next);
      expect((await gitLog(path))[0]).toBe(`Version ${type} bump`);
    },
  );

  it.each(['patch', 'minor', 'major'] as const)(
    'a first %s bump gives 1.0.0',
    async (type) => {
      const { ws, path } = await open(
        { ...spec, version: undefined },
        autocommit,
      );

      expect(await ws.versions.bump(type)).toEqual({
        previousVersion: undefined,
        newVersion: '1.0.0',
      });
      expect(publishedVersion(path)).toBe('1.0.0');
    },
  );

  it('follows one bump with the next', async () => {
    const { ws } = await open(spec, autocommit);

    await ws.versions.bump('minor');

    expect((await ws.versions.bump('patch')).newVersion).toBe('1.3.1');
  });

  it.each([
    ['a first bump', undefined, 'patch', 1],
    ['a minor bump', '1.2.3', 'minor', 1],
    ['a major bump', '1.2.3', 'major', 1],
    ['a patch bump', '1.2.3', 'patch', 0],
  ] as const)(
    '%s leaves %i seal of the log',
    async (_, version, type, count) => {
      const { ws, path } = await open({ ...spec, version }, autocommit);

      await ws.versions.bump(type);

      expect(seals(path)).toHaveLength(count);
    },
  );

  describe('refuses', () => {
    const refused = (
      ws: Workspace,
      path: string,
      type: BumpType,
      message: RegExp,
    ) => expectRefused(path, () => ws.versions.bump(type), message);

    it('a bump type it does not know', async () => {
      const { ws, path } = await open(spec, autocommit);

      await refused(ws, path, 'huge' as BumpType, /Invalid bump type 'huge'/);
      expect(checkoutOf(ws).configuration.version).toBe('1.2.3');
    });

    it('a project with validation errors', async () => {
      const { ws, path } = await open(
        { ...spec, cards: [{ workflowState: 'Nowhere' }] },
        autocommit,
      );

      await refused(
        ws,
        path,
        'major',
        /Cannot version: project has validation errors/,
      );
    });

    it('a project with uncommitted changes', async () => {
      const { ws, path, keys } = await open(spec);
      writeFileSync(join(path, 'cardRoot', keys[0], 'index.adoc'), 'edited');

      await refused(ws, path, 'minor', /uncommitted changes/);
    });

    // Pins today's behaviour: under autocommit the refused write is rolled
    // back, which discards the uncommitted edit that caused the refusal and
    // untracked files under cardRoot and .cards (git clean; not exercised here,
    // as such a file fails validation first).
    it('a project with uncommitted changes, discarding them under autocommit', async () => {
      const { ws, path, keys } = await open(spec, autocommit);
      const file = join(path, 'cardRoot', keys[0], 'index.adoc');
      writeFileSync(file, 'edited');

      await expect(ws.versions.bump('minor')).rejects.toThrow(
        /uncommitted changes/,
      );

      expect(readFileSync(file, 'utf-8')).toBe('');
    });
  });

  describe('gates the change a bump can carry', () => {
    // A workflow rename migrates consumers; deleting a report breaks them.
    const changes = {
      migratable: (ws: Workspace) => rename(ws, 'test/workflows/flow', 'moved'),
      breaking: (ws: Workspace) => remove(ws, 'test/reports/status'),
    };

    it.each([
      [
        'patch',
        'migratable',
        /patch version[\s\S]*\(resource_rename\)[\s\S]*Use a minor/,
      ],
      [
        'patch',
        'breaking',
        /patch version[\s\S]*\(resource_delete\)[\s\S]*Use a major/,
      ],
      [
        'minor',
        'breaking',
        /minor version[\s\S]*\(resource_delete\)[\s\S]*Use a major/,
      ],
    ] as const)(
      'a %s bump after a %s change, naming the entry',
      async (type, change, message) => {
        const { ws, path } = await open(spec, autocommit);
        await changes[change](ws);

        await expectRefused(path, () => ws.versions.bump(type), message);
        expect(checkoutOf(ws).configuration.version).toBe('1.2.3');
      },
    );

    it.each([
      ['minor', 'migratable', '1.3.0'],
      ['major', 'migratable', '2.0.0'],
      ['major', 'breaking', '2.0.0'],
    ] as const)(
      'a %s bump after a %s change, sealing it',
      async (type, change, next) => {
        const { ws, path } = await open(spec, autocommit);
        await changes[change](ws);

        expect((await ws.versions.bump(type)).newVersion).toBe(next);

        expect(seals(path)).toEqual([`migrationLog_0.0.0_${next}.jsonl`]);
        expect(ConfigurationLogger.hasPendingChanges(path)).toBe(false);
      },
    );

    it('lists two edits of one resource apart', async () => {
      const { ws, path } = await open(spec, autocommit);
      await log(path, 'resource_update', field, removeEnumValue);
      await log(path, 'resource_update', field, changeDataType);
      await commitAll(path, 'log');

      await expectRefused(
        path,
        () => ws.versions.bump('patch'),
        /priority \(resource_update\) enumValues remove[\s\S]*priority \(resource_update\) dataType change/,
      );
    });

    // What the entry of each breaking edit looks like to the gate.
    it.each([
      ['a data type change', field, changeDataType, 'dataType change'],
      ['an enum value removal', field, removeEnumValue, 'enumValues remove'],
      [
        'a state removal',
        'test/workflows/flow',
        {
          key: 'states',
          operation: { name: 'remove', target: { name: 'Draft' } },
        },
        'states remove',
      ],
      [
        'a change of the workflow of a card type',
        'test/cardTypes/page',
        {
          key: 'workflow',
          operation: { name: 'change', target: 'flow', to: 'other' },
        },
        'workflow change',
      ],
    ])(
      'refuses a minor bump after %s, pointing at a major',
      async (_, target, parameters, detail) => {
        const { ws, path } = await open(spec, autocommit);
        await log(path, 'resource_update', target, parameters);
        await commitAll(path, 'log');

        await expectRefused(
          path,
          () => ws.versions.bump('minor'),
          new RegExp(
            `${target} \\(resource_update\\) ${detail}[\\s\\S]*Use a major version bump\\.`,
          ),
        );
      },
    );

    // Entries this build cannot route are as strict as a breaking one.
    it.each([
      [
        'an entry it cannot route',
        'resource_update',
        {},
        '(resource_update) — unrecognised entry, treated as breaking',
      ],
      [
        'an entry of an operation it does not know',
        'resource_transmute',
        { key: 'enumValues' },
        '(resource_transmute) enumValues — unrecognised entry, treated as breaking',
      ],
      [
        'an entry of a retired operation',
        'project_rename',
        {},
        '(project_rename) — retired operation, treated as breaking',
      ],
    ])('%s', async (_, operation, parameters, line) => {
      const { ws, path } = await open(spec, autocommit);
      await log(path, operation, 'test/fieldTypes/x', parameters);
      await commitAll(path, 'log');

      const message = new RegExp(
        `test/fieldTypes/x ${line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
      );

      await expectRefused(path, () => ws.versions.bump('minor'), message);
      await expectRefused(path, () => ws.versions.bump('patch'), message);
      expect((await ws.versions.bump('major')).newVersion).toBe('2.0.0');
    });

    it('lets the first version through whatever the log holds', async () => {
      const { ws, path } = await open(
        { ...spec, version: undefined },
        autocommit,
      );
      await remove(ws, 'test/reports/status');

      expect((await ws.versions.bump('patch')).newVersion).toBe('1.0.0');
      expect(seals(path)).toHaveLength(1);
    });
  });
});
