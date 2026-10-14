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

// Phase-1 exit criterion: two workspaces over two directories in one
// process, written in turn. Concurrent cross-talk is out of scope.

import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

import type { ChangeEvent } from '@cyberismo/model';
import { localFolder } from '../../src/directory/local-folder.js';
import { folders } from './folder.js';

const folder = folders();

const git = (cwd: string, ...args: string[]) =>
  promisify(execFile)('git', args, { cwd }).then(({ stdout }) => stdout.trim());

const ann = {
  actor: { kind: 'user', id: 'ann', name: 'Ann' },
  identity: { name: 'Ann', email: 'ann@example.com' },
} as const;
const bob = {
  actor: { kind: 'user', id: 'bob', name: 'Bob' },
  identity: { name: 'Bob', email: 'bob@example.com' },
} as const;

it('writes to two workspaces in turn: each commits and emits only its own changes', async () => {
  const a = await folder({ prefix: 'alpha', git: true, cards: [{}] });
  const b = await folder({ prefix: 'beta', git: true, cards: [{}] });
  const [one, two] = await Promise.all(
    [a, b].map(async ({ root }) => {
      const { directory, failed } = await localFolder(root, {
        autocommit: true,
      });
      expect(failed).toEqual([]);
      return directory;
    }),
  );
  const alpha = await one.open('alpha', ann.actor, ann.identity);
  const beta = await two.open('beta', bob.actor, bob.identity);
  const events: Record<string, ChangeEvent[]> = { alpha: [], beta: [] };
  alpha.changes.subscribe((event) => events.alpha.push(event));
  beta.changes.subscribe((event) => events.beta.push(event));
  const [alphaKey] = a.keys.alpha;
  const [betaKey] = b.keys.beta;

  await alpha.cards.addLabel(alphaKey, 'first');
  await beta.cards.addLabel(betaKey, 'second');
  await alpha.cards.edit(alphaKey, 'Alpha again');

  const log = (root: string, prefix: string) =>
    git(join(root, prefix), 'log', '--format=%an|%s');
  expect((await log(a.root, 'alpha')).split('\n')).toEqual([
    expect.stringMatching(/^Ann\|/),
    expect.stringMatching(/^Ann\|/),
    expect.not.stringMatching(/^(Ann|Bob)\|/),
  ]);
  expect((await log(b.root, 'beta')).split('\n')).toEqual([
    expect.stringMatching(/^Bob\|/),
    expect.not.stringMatching(/^(Ann|Bob)\|/),
  ]);
  for (const [root, prefix] of [
    [a.root, 'alpha'],
    [b.root, 'beta'],
  ]) {
    expect(await git(join(root, prefix), 'status', '--porcelain')).toBe('');
  }
  const summary = (list: ChangeEvent[]) =>
    list.map(({ project, actor, changes }) => ({
      project,
      actor: actor.id,
      changes,
    }));
  expect(summary(events.alpha)).toEqual([
    {
      project: 'alpha',
      actor: 'ann',
      changes: [{ kind: 'card.updated', key: alphaKey }],
    },
    {
      project: 'alpha',
      actor: 'ann',
      changes: [{ kind: 'card.updated', key: alphaKey }],
    },
  ]);
  expect(summary(events.beta)).toEqual([
    {
      project: 'beta',
      actor: 'bob',
      changes: [{ kind: 'card.updated', key: betaKey }],
    },
  ]);
});
