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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';

import type { ActorRef, ChangeEvent } from '@cyberismo/model';
import { Workspace } from '../src/workspace/workspace.js';
import { resourceName } from '../src/utils/resource-utils.js';
import { openTestWorkspace } from './helpers/open-test-workspace.js';
import { mockEnsureModuleListUpToDate } from './helpers/test-utils.js';
import { renameProject } from '../src/directory/rename-project.js';

const testData = join(import.meta.dirname, 'test-data/valid');
const writer: ActorRef = { kind: 'user', id: 'writer', name: 'Writer' };
const identity = { name: 'Writer', email: 'writer@example.com' };

// Projects live outside the monorepo, so an autocommit project gets its own
// repository.
describe('change feed', () => {
  let dir: string;
  let ws: Workspace;
  let events: ChangeEvent[];

  async function open(autocommit: boolean) {
    ws = await openTestWorkspace(join(dir, 'decision-records'), {
      autocommit,
      actor: writer,
      identity,
    });
    events = [];
    ws.changes.subscribe((event) => events.push(event));
  }

  const changesOf = () => events.map((event) => event.changes);

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'change-feed-test-'));
    await cp(
      join(testData, 'decision-records'),
      join(dir, 'decision-records'),
      { recursive: true },
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  it('publishes one event per write, after it, as its actor', async () => {
    await open(false);
    await ws.cards.edit('decision_5', 'Edited');
    await ws.cards.edit('decision_6', 'Edited');

    expect(events).toEqual([
      {
        project: 'decision',
        workspace: 'main',
        epoch: expect.any(String),
        revision: 1,
        actor: writer,
        cause: 'direct',
        at: expect.any(String),
        changes: [{ kind: 'card.updated', key: 'decision_5' }],
      },
      expect.objectContaining({
        epoch: events[0].epoch,
        revision: 2,
        changes: [{ kind: 'card.updated', key: 'decision_6' }],
      }),
    ]);
    expect(JSON.stringify(events)).not.toContain(identity.email);
  });

  const writes: {
    write: string;
    run: () => Promise<unknown>;
    changes: ChangeEvent['changes'];
  }[] = [
    {
      write: 'an atomic write',
      run: () =>
        ws.atomic(async () => {
          await ws.cards.edit('decision_5', 'One');
          await ws.cards.edit('decision_6', 'Two');
        }, 'Edit two cards'),
      changes: [
        { kind: 'card.updated', key: 'decision_5' },
        { kind: 'card.updated', key: 'decision_6' },
      ],
    },
    {
      write: 'a link, naming its target',
      run: () =>
        ws.cards.addLink('decision_5', 'decision_6', 'decision/linkTypes/test'),
      changes: [
        { kind: 'card.updated', key: 'decision_5' },
        { kind: 'card.updated', key: 'decision_6' },
      ],
    },
    {
      write: 'a subtree removal',
      run: () => ws.cards.remove('decision_5'),
      changes: [
        { kind: 'card.removed', key: 'decision_6' },
        { kind: 'card.removed', key: 'decision_5' },
      ],
    },
    {
      write: 'a resource rename, with the cards it rewrote',
      run: () =>
        ws.changes.apply({
          kind: 'rename',
          target: resourceName('decision/reports/testReport'),
          newIdentifier: 'renamed',
        }),
      changes: [
        { kind: 'card.updated', key: 'decision_5' },
        { kind: 'resource.changed', name: 'decision/reports/testReport' },
        { kind: 'resource.changed', name: 'decision/reports/renamed' },
      ],
    },
    {
      write: 'a settings change',
      run: () => ws.settings.setDescription('Described'),
      changes: [{ kind: 'settings.changed' }],
    },
    {
      write: 'a prefix rename',
      run: () => renameProject(ws, 'renamed'),
      changes: [{ kind: 'project.reloaded' }],
    },
  ];

  it.each(writes)('publishes $write as one event', async ({ run, changes }) => {
    await open(false);
    await run();
    expect(changesOf()).toEqual([changes]);
  });

  it('publishes nothing for a write that changed nothing', async () => {
    await open(false);
    await ws.atomic(async () => {}, 'Nothing');
    await ws.cards.edit('decision_5', 'Edited');
    expect(events.map((event) => event.revision)).toEqual([1]);
  });

  it('carries the full SHA of the commit under autocommit', async () => {
    await open(true);
    await ws.cards.edit('decision_5', 'Edited');
    const head = await simpleGit(ws.path).revparse(['HEAD']);
    expect(events.map((event) => event.commit)).toEqual([head]);
  });

  it('publishes nothing for a write that was rolled back', async () => {
    await open(true);
    const failed = ws.atomic(async () => {
      await ws.cards.edit('decision_5', 'Edited');
      throw new Error('boom');
    }, 'Fail');
    await expect(failed).rejects.toThrow('boom');
    expect(events).toEqual([]);
  });

  it('publishes a reload for a failed write that changed something', async () => {
    await open(false);
    const failed = ws.atomic(async () => {
      await ws.cards.edit('decision_5', 'Edited');
      throw new Error('boom');
    }, 'Fail');
    await expect(failed).rejects.toThrow('boom');
    await expect(
      ws.atomic(async () => {
        throw new Error('nothing written');
      }, 'Fail'),
    ).rejects.toThrow('nothing written');
    expect(events).toEqual([
      expect.objectContaining({
        cause: 'failed-write',
        changes: [{ kind: 'project.reloaded' }],
      }),
    ]);
  });

  it('gives a subscriber that writes its own event and commit', async () => {
    await open(true);
    const bot = Workspace.over(ws.checkout, {
      kind: 'connector',
      id: 'bot',
      name: 'Bot',
    });
    const unsubscribe = bot.changes.subscribe((event) => {
      if (event.actor.id === writer.id) {
        void bot.cards.edit('decision_6', 'Followed up');
      }
    });
    await ws.cards.edit('decision_5', 'Edited');
    unsubscribe();
    // A read queues behind the follow-up write.
    await ws.cards.details('decision_6');

    expect(events.map(({ actor, revision }) => [actor.id, revision])).toEqual([
      ['writer', 1],
      ['bot', 2],
    ]);
    const log = await simpleGit(ws.path).log();
    expect(
      log.all.slice(0, 2).map(({ hash, message, body }) => ({
        hash,
        message,
        actor: body.match(/Cyberismo-Actor: (.*)/)?.[1],
      })),
    ).toEqual([
      {
        hash: events[1].commit,
        message: 'Edit content of decision_6',
        actor: 'connector:bot',
      },
      {
        hash: events[0].commit,
        message: 'Edit content of decision_5',
        actor: 'user:writer',
      },
    ]);
    expect(log.all[1].author_name).toBe(identity.name);
    expect(log.all[0].author_name).not.toBe(identity.name);
  });

  it('publishes a version bump as a settings change', async () => {
    await open(true);
    await ws.versions.bump('minor');
    expect(changesOf()).toEqual([[{ kind: 'settings.changed' }]]);
  });

  it('logs and swallows a listener error', async () => {
    await open(false);
    ws.changes.subscribe(() => {
      throw new Error('listener failed');
    });
    const later: ChangeEvent[] = [];
    ws.changes.subscribe((event) => later.push(event));
    await ws.cards.edit('decision_5', 'Edited');
    expect([events.length, later.length]).toEqual([1, 1]);
  });

  // Removing a module writes its declaration out of the settings; when the
  // write then fails, the rollback has to re-read them.
  it('re-reads settings and module prefixes after a rollback', async () => {
    mockEnsureModuleListUpToDate();
    await open(true);
    await ws.modules.install(join(testData, 'minimal'));
    const modules = structuredClone(ws.checkout.configuration.modules);

    const failed = ws.atomic(async () => {
      await ws.modules.remove('mini');
      throw new Error('boom');
    }, 'Remove module');
    await expect(failed).rejects.toThrow('boom');

    expect(ws.checkout.configuration.modules).toEqual(modules);
    expect(ws.checkout.allModulePrefixes()).toContain('mini');
  });
});
