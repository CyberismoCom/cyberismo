import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CommandManager } from '@cyberismo/data-handler';
import { createApp } from '../src/app.js';
import { MockAuthProvider } from '../src/auth/mock.js';
import { ProjectRegistry } from '../src/project-registry.js';
import { createTempTestData, cleanupTempTestData } from './test-utils.js';

let app: ReturnType<typeof createApp>;
let tempTestDataPath: string;
let worktrees: string;
let main: CommandManager;
let registry: ProjectRegistry;
const base = '/api/projects/decision';

beforeAll(async () => {
  process.argv = [];
  tempTestDataPath = await createTempTestData('decision-records');
  worktrees = await mkdtemp(join(tmpdir(), 'changesets-api-'));
  process.env.CYBERISMO_CHANGESETS_DIR = worktrees;
  main = new CommandManager(tempTestDataPath, { autocommit: true });
  await main.initialize();
  registry = ProjectRegistry.fromCommandManager(main);
  app = createApp(new MockAuthProvider({ roster: true }), registry);
});

afterAll(async () => {
  registry.dispose();
  delete process.env.CYBERISMO_CHANGESETS_DIR;
  await cleanupTempTestData(tempTestDataPath);
  await rm(worktrees, { recursive: true, force: true });
});

function request(
  method: string,
  path: string,
  body?: unknown,
  user: 'alice' | 'bob' | 'carol' = 'bob',
) {
  return app.request(`${base}${path}`, {
    method,
    headers: {
      cookie: `mock-user=${user}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function create(title: string): Promise<string> {
  const response = await request('POST', '/changesets', { title });
  expect(response.status).toBe(201);
  return (await response.json()).id;
}

const mainContent = (key: string) => main.project.findCard(key).content;
const changeSetContent = async (id: string, key: string) =>
  (await registry.openChangeSet(main, id)).project.findCard(key).content;

describe('changeSets API', () => {
  test('readers can list changeSets but not start them', async () => {
    expect(
      (await request('GET', '/changesets', undefined, 'carol')).status,
    ).toBe(200);
    expect(
      (await request('POST', '/changesets', { title: 'No' }, 'carol')).status,
    ).toBe(403);
    expect((await request('POST', '/changesets', { title: '' })).status).toBe(
      400,
    );
  });

  test('serves the project routes from inside a changeSet', async () => {
    const id = await create('Inside');
    const patch = await request('PATCH', `/changesets/${id}/cards/decision_5`, {
      content: 'Changed in changeSet',
    });
    expect(patch.status).toBe(200);

    expect(await changeSetContent(id, 'decision_5')).toBe(
      'Changed in changeSet',
    );
    expect(mainContent('decision_5')).not.toBe('Changed in changeSet');
    const card = await request('GET', `/changesets/${id}/cards/decision_5`);
    expect(card.status).toBe(200);
    expect(await card.text()).toContain('Changed in changeSet');
  });

  test('lists changes, shows a card diff and keeps review marks', async () => {
    const id = await create('Review');
    await request('PATCH', `/changesets/${id}/cards/decision_6`, {
      content: 'Reviewed content',
    });

    const changes = await (
      await request('GET', `/changesets/${id}/changes`)
    ).json();
    expect(changes.cards).toMatchObject([
      {
        key: 'decision_6',
        kind: 'modified',
        contentChanged: true,
        reviewed: false,
      },
    ]);
    expect(changes.cards[0].commits[0]).toMatchObject({
      author: { name: 'Bob' },
      actor: 'human',
    });

    const diff = await (
      await request('GET', `/changesets/${id}/changes/decision_6`)
    ).json();
    expect(diff.after.content).toBe('Reviewed content');
    expect(diff.before.content).not.toBe('Reviewed content');
    expect(
      (await request('GET', `/changesets/${id}/changes/decision_5`)).status,
    ).toBe(404);

    expect(
      (
        await request('PUT', `/changesets/${id}/changes/decision_6/reviewed`, {
          reviewed: true,
        })
      ).status,
    ).toBe(204);
    const reviewed = await (
      await request('GET', `/changesets/${id}/changes`)
    ).json();
    expect(reviewed.cards[0].reviewed).toBe(true);
  });

  test('reverts a card', async () => {
    const id = await create('Revert');
    const original = mainContent('decision_5');
    await request('PATCH', `/changesets/${id}/cards/decision_5`, {
      content: 'Undo me',
    });

    const revert = await request(
      'POST',
      `/changesets/${id}/changes/decision_5/revert`,
    );

    expect(revert.status).toBe(204);
    expect(await changeSetContent(id, 'decision_5')).toBe(original);
  });

  test('returns conflicts from an update, and merges once up to date', async () => {
    const id = await create('Ship');
    await request('PATCH', `/changesets/${id}/cards/decision_6`, {
      content: 'From the changeSet',
    });
    await request('PATCH', '/cards/decision_6', { content: 'From main' });

    expect((await request('POST', `/changesets/${id}/merge`)).status).toBe(409);
    const conflicted = await request('POST', `/changesets/${id}/update`, {});
    expect(await conflicted.json()).toMatchObject({
      updated: false,
      conflicts: [
        {
          path: 'cardRoot/decision_5/c/decision_6/index.adoc',
          key: 'decision_6',
          ours: 'From the changeSet',
          theirs: 'From main',
        },
      ],
    });

    const updated = await request('POST', `/changesets/${id}/update`, {
      resolutions: { 'cardRoot/decision_5/c/decision_6/index.adoc': 'ours' },
    });
    expect(await updated.json()).toEqual({ updated: true, conflicts: [] });

    const merged = await request('POST', `/changesets/${id}/merge`);
    expect(merged.status).toBe(200);
    expect(await merged.json()).toMatchObject({
      status: 'merged',
      merged: { by: { name: 'Bob' } },
    });
    expect(mainContent('decision_6')).toBe('From the changeSet');
    expect(
      (await request('GET', `/changesets/${id}/cards/decision_6`)).status,
    ).toBe(409);
  });

  test('discards a changeSet, and knows no unknown ids', async () => {
    const id = await create('Abandon');

    const discarded = await request('DELETE', `/changesets/${id}`);

    expect(await discarded.json()).toMatchObject({ id, status: 'discarded' });
    expect((await request('GET', '/changesets/nope')).status).toBe(404);
    expect(
      (await request('GET', '/changesets/nope/cards/decision_5')).status,
    ).toBe(404);
  });

  test('tells the project’s viewers when a changeSet changes', async () => {
    const response = await request('GET', '/events', undefined, 'carol');
    const reader = response.body!.getReader();
    try {
      const id = await create('Announced');
      const decoder = new TextDecoder();
      let text = '';
      while (!text.includes('event: changeset.updated')) {
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
      }
      const block = text
        .split('\n\n')
        .find((part) => part.includes('event: changeset.updated'))!;
      const data = JSON.parse(
        block
          .split('\n')
          .find((line) => line.startsWith('data: '))!
          .slice(6),
      );
      expect(data).toEqual({
        id,
        action: 'created',
        userId: 'mock-user-bob',
        userName: 'Bob',
      });
    } finally {
      await reader.cancel();
    }
  });
});
