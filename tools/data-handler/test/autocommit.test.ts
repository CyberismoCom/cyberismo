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

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';

import { type Workspace } from '../src/workspace/workspace.js';
import { resourceName } from '../src/utils/resource-utils.js';
import { openTestWorkspace } from './helpers/open-test-workspace.js';

const fixture = join(import.meta.dirname, 'test-data/valid/decision-records');
const author = { name: 'Writer', email: 'writer@example.com' };
const actor = { kind: 'user', id: 'writer', name: 'Writer' } as const;

// Each outermost write under autocommit makes exactly one commit of its own.
describe('autocommit', () => {
  let dir: string;
  let cm: Workspace;

  beforeEach(async () => {
    // Outside the monorepo, so the project gets its own repository.
    dir = await mkdtemp(join(tmpdir(), 'autocommit-test-'));
    await cp(fixture, dir, { recursive: true });
    cm = await openTestWorkspace(dir, {
      autocommit: true,
      actor,
      identity: author,
    });
  });

  afterEach(async () => {
    cm.checkout.dispose();
    await rm(dir, { recursive: true, force: true });
  });

  interface Write {
    setup?: () => Promise<string>;
    write: (setupResult: string) => Promise<unknown>;
    message: (setupResult: string) => string;
  }

  const writes: Record<string, Write> = {
    'card create': {
      write: () => cm.cards.create('decision/templates/decision'),
      message: () => 'Create card from template decision/templates/decision',
    },
    'card edit': {
      write: () => cm.cards.edit('decision_5', 'edited'),
      message: () => 'Edit content of decision_5',
    },
    'card move': {
      write: () => cm.cards.move('decision_6', 'root'),
      message: () => 'Move card decision_6 to root',
    },
    'card rank': {
      // A second root card, ranked after decision_5, to move first.
      setup: async () =>
        (await cm.cards.create('decision/templates/decision'))[0].key,
      write: (key) => cm.cards.rankFirst(key),
      message: (key) => `Rank card ${key} first`,
    },
    'card remove': {
      write: () => cm.cards.remove('decision_6'),
      message: () => 'Remove card decision_6',
    },
    label: {
      write: () => cm.cards.addLabel('decision_5', 'urgent'),
      message: () => 'Add label urgent to decision_5',
    },
    'resource create': {
      write: () =>
        cm.resources.create('newField', 'fieldTypes', {
          dataType: 'shortText',
        }),
      message: () => 'Create field type newField',
    },
    'resource create by change': {
      write: () =>
        cm.changes.apply({
          kind: 'create',
          target: resourceName('decision/fieldTypes/newField'),
          params: { dataType: 'shortText' },
        }),
      message: () => 'Create field type decision/fieldTypes/newField',
    },
    'resource edit': {
      write: () =>
        cm.changes.apply({
          kind: 'edit',
          target: resourceName('decision/fieldTypes/admins'),
          updateKey: { key: 'displayName' },
          operation: { name: 'change', target: 'Administrators', to: 'Admins' },
        }),
      message: () => 'Update decision/fieldTypes/admins',
    },
  };

  it.each(Object.keys(writes))('commits a %s on its own', async (kind) => {
    const { setup, write, message } = writes[kind];
    const git = simpleGit(dir);
    const setupResult = setup ? await setup() : '';
    const before = (await git.log()).total;

    await write(setupResult);

    const log = await git.log();
    expect(log.total).toBe(before + 1);
    expect(log.latest!.message).toBe(message(setupResult));
    expect(log.latest!.author_name).toBe(author.name);
    expect((await git.status()).isClean()).toBe(true);
  });
});
