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

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import type { MockInstance } from 'vitest';
import { CommandManager } from '@cyberismo/data-handler';
import type { SSEMessage } from 'hono/streaming';
import { createApp } from '../src/app.js';
import { MockAuthProvider } from '../src/auth/mock.js';
import { ProjectEvents } from '../src/project-events.js';
import { ProjectRegistry } from '../src/project-registry.js';
import { UserRole } from '../src/types.js';
import { createTempTestData, cleanupTempTestData } from './test-utils.js';

let app: ReturnType<typeof createApp>;
let path: string;
let commands: CommandManager;
let registry: ProjectRegistry;
const readers: ReadableStreamDefaultReader<Uint8Array>[] = [];
const base = '/api/projects/decision';

beforeAll(async () => {
  process.argv = [];
  path = await createTempTestData('decision-records');
  commands = new CommandManager(path);
  await commands.initialize();
  registry = ProjectRegistry.fromCommandManager(commands);
  app = createApp(new MockAuthProvider({ roster: true }), registry);
});
beforeEach(() => vi.stubEnv('APP_PRESENCE_ENABLED', 'true'));
afterEach(async () => {
  await Promise.all(readers.splice(0).map((reader) => reader.cancel()));
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
afterAll(async () => {
  registry.dispose();
  await cleanupTempTestData(path);
});

async function nextEvent(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  name: string,
) {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Missing ${name}`)), 2000);
  });
  try {
    return await Promise.race([
      timeout,
      (async () => {
        const decoder = new TextDecoder();
        let text = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) throw new Error('Stream closed');
          text += decoder.decode(value, { stream: true });
          const blocks = text.split('\n\n');
          text = blocks.pop()!;
          for (const block of blocks) {
            if (!block.includes(`event: ${name}\n`)) continue;
            const data = block
              .split('\n')
              .find((line) => line.startsWith('data: '))!;
            return JSON.parse(data.slice(6));
          }
        }
      })(),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

async function connect(user = 'alice', target = app) {
  const response = await target.request(`${base}/events`, {
    headers: { cookie: `mock-user=${user}` },
  });
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('text/event-stream');
  const reader = response.body!.getReader();
  readers.push(reader);
  return { reader, ready: await nextEvent(reader, 'ready') };
}

async function presence(
  connectionId: string,
  cardKey: string | null,
  sequence = 1,
  user = 'alice',
  mode = 'viewing',
) {
  return app.request(`${base}/presence`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      cookie: `mock-user=${user}`,
    },
    body: JSON.stringify({ connectionId, cardKey, sequence, mode }),
  });
}

async function patch(cardKey: string, body: unknown, user = 'bob') {
  return app.request(`${base}/cards/${cardKey}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      cookie: `mock-user=${user}`,
    },
    body: JSON.stringify(body),
  });
}

describe('project event stream over HTTP', () => {
  test('reader joins presence through HTTP and receives a full card snapshot', async () => {
    const { reader, ready } = await connect('carol');
    expect(ready.presence).toEqual({});

    expect(
      (await presence(ready.connectionId, 'decision_5', 1, 'carol')).status,
    ).toBe(204);
    expect(await nextEvent(reader, 'presence.updated')).toEqual({
      cardKey: 'decision_5',
      users: [
        { userId: 'mock-user-carol', userName: 'Carol', mode: 'viewing' },
      ],
    });

    expect((await presence(ready.connectionId, null, 2, 'carol')).status).toBe(
      204,
    );
    expect(await nextEvent(reader, 'presence.updated')).toEqual({
      cardKey: 'decision_5',
      users: [],
    });
  });

  test('connection IDs are bound to their user and invalid cards are rejected', async () => {
    const { ready } = await connect();
    expect(
      (await presence(ready.connectionId, 'decision_5', 1, 'bob')).status,
    ).toBe(404);
    expect((await presence(ready.connectionId, 'missing')).status).toBe(404);
  });

  test('presence reporting is inert unless APP_PRESENCE_ENABLED is true', async () => {
    vi.stubEnv('APP_PRESENCE_ENABLED', 'false');
    const { ready } = await connect();
    expect((await presence(ready.connectionId, 'decision_5')).status).toBe(204);
    const other = await connect('bob');
    expect(other.ready.presence).toEqual({});
  });

  test('HTTP writes broadcast even with presence disabled', async () => {
    vi.stubEnv('APP_PRESENCE_ENABLED', 'false');
    const { reader } = await connect('carol');
    const written = {
      content: 'Written while disabled',
      metadata: { title: 'Written while disabled' },
    };
    expect((await patch('decision_5', written, 'alice')).status).toBe(200);
    expect(await nextEvent(reader, 'card.updated')).toEqual({
      cardKey: 'decision_5',
      userId: 'mock-user-alice',
      userName: 'Alice',
    });
  });

  test('export mode serves no event stream', async () => {
    const exported = createApp(
      new MockAuthProvider(),
      ProjectRegistry.fromCommandManager(commands),
      undefined,
      true,
    );
    expect((await exported.request(`${base}/events`)).status).toBe(404);
  });

  test('disposal closes subscriptions', async () => {
    const ownCommands = new CommandManager(path);
    await ownCommands.initialize();
    const ownRegistry = ProjectRegistry.fromCommandManager(ownCommands);
    const { reader } = await connect(
      'alice',
      createApp(new MockAuthProvider({ roster: true }), ownRegistry),
    );
    ownRegistry.dispose();
    expect((await reader.read()).done).toBe(true);
  });
});

describe('presence bookkeeping', () => {
  function setup() {
    const events = new ProjectEvents();
    const messages: SSEMessage[] = [];
    const user = {
      id: 'same-user',
      name: 'Alice',
      email: '',
      role: UserRole.Admin,
    };
    const connect = () =>
      events.connect(
        user,
        (message) => messages.push(message),
        () => {},
      );
    const latest = (event: string) =>
      JSON.parse(
        String(
          messages.filter((message) => message.event === event).at(-1)!.data,
        ),
      );
    return { events, connect, latest, messages, user };
  }

  test('deduplicates tabs, prefers editing, and ignores delayed updates', () => {
    const { events, connect, latest } = setup();
    try {
      const first = connect();
      const second = connect();
      connect();
      events.update(first, 'same-user', 1, 'decision_5', 'viewing');
      events.update(second, 'same-user', 2, 'decision_5', 'editing');
      events.update(second, 'same-user', 1, null, 'viewing');
      expect(latest('presence.updated').users).toEqual([
        { userId: 'same-user', userName: 'Alice', mode: 'editing' },
      ]);

      events.disconnect(second);
      expect(latest('presence.updated').users).toEqual([
        { userId: 'same-user', userName: 'Alice', mode: 'viewing' },
      ]);
      events.disconnect(first);
      expect(latest('presence.updated').users).toEqual([]);
      expect(
        events.update(first, 'same-user', 3, 'decision_5', 'editing'),
      ).toBe(false);
    } finally {
      events.dispose();
    }
  });

  test('new subscribers receive all occupied cards and projects remain isolated', () => {
    const { events, connect, latest } = setup();
    try {
      events.update(connect(), 'same-user', 1, 'decision_5', 'editing');
      connect();
      expect(latest('ready').presence).toEqual({
        decision_5: [
          { userId: 'same-user', userName: 'Alice', mode: 'editing' },
        ],
      });
    } finally {
      events.dispose();
    }

    const one = {} as CommandManager;
    const two = {} as CommandManager;
    const projects = new ProjectRegistry();
    projects.add('one', one);
    projects.add('two', two);
    try {
      expect(projects.eventsFor(one)).toBe(projects.eventsFor(one));
      expect(projects.eventsFor(one)).not.toBe(projects.eventsFor(two));
      expect(() => projects.eventsFor({} as CommandManager)).toThrow();
    } finally {
      projects.eventsFor(one).dispose();
      projects.eventsFor(two).dispose();
    }
  });

  test('presence expires unless renewed', () => {
    vi.useFakeTimers();
    const { events, connect, latest } = setup();
    try {
      const connection = connect();
      events.update(connection, 'same-user', 1, 'decision_5', 'viewing');
      vi.advanceTimersByTime(60_000);
      events.update(connection, 'same-user', 2, 'decision_5', 'viewing');
      vi.advanceTimersByTime(60_000);
      expect(latest('presence.updated').users).toHaveLength(1);
      vi.advanceTimersByTime(30_000);
      expect(latest('presence.updated').users).toEqual([]);
    } finally {
      events.dispose();
    }
  });

  test('a card named twice by one write is notified once', () => {
    const { events, connect, messages, user } = setup();
    try {
      connect();
      messages.length = 0;
      events.cardsUpdated(['decision_5', 'decision_6', 'decision_5'], user);
      expect(
        messages.map((message) => JSON.parse(String(message.data)).cardKey),
      ).toEqual(['decision_5', 'decision_6']);
    } finally {
      events.dispose();
    }
  });
});

describe('card update notifications', () => {
  const asBob = { cookie: 'mock-user=bob' };
  const json = (body: unknown) => ({
    headers: { 'content-type': 'application/json', ...asBob },
    body: JSON.stringify(body),
  });
  const link = { toCard: 'decision_6', linkType: 'decision/linkTypes/test' };
  const attach = async (filename: string) => {
    const form = new FormData();
    form.append('files', new Blob(['hello'], { type: 'text/plain' }), filename);
    return app.request(`${base}/cards/decision_5/attachments`, {
      method: 'POST',
      headers: asBob,
      body: form,
    });
  };
  const addLink = async (description: string) =>
    app.request(`${base}/cards/decision_5/links`, {
      method: 'POST',
      ...json({ ...link, direction: 'outbound', description }),
    });

  let notify: MockInstance<ProjectEvents['cardsUpdated']>;
  let retargeted: string;
  let edited: string;

  beforeAll(async () => {
    const [target] = await commands.createCmd.createCard(
      'decision/templates/decision',
      'decision_5',
    );
    retargeted = target.key;
    const [scratch] = await commands.createCmd.createCard(
      'decision/templates/decision',
      'decision_5',
    );
    edited = scratch.key;
  });
  beforeEach(() => {
    notify = vi.spyOn(registry.eventsFor(commands), 'cardsUpdated');
  });
  afterEach(() => notify.mockRestore());

  const bodies: { field: string; body: () => unknown; notifies: number }[] = [
    { field: 'nothing', body: () => ({}), notifies: 0 },
    { field: 'state', body: () => ({ state: 'Approve' }), notifies: 1 },
    { field: 'content', body: () => ({ content: 'Edited body' }), notifies: 1 },
    {
      field: 'metadata',
      body: () => ({ metadata: { title: 'Edited title' } }),
      notifies: 1,
    },
    { field: 'parent', body: () => ({ parent: 'decision_6' }), notifies: 1 },
    { field: 'index', body: () => ({ index: 0 }), notifies: 1 },
  ];

  test.each(bodies)(
    'a PATCH body carrying $field notifies $notifies time(s)',
    async ({ body, notifies }) => {
      expect((await patch(edited, body())).status).toBe(200);
      expect(notify.mock.calls).toEqual(
        notifies
          ? [[[edited], expect.objectContaining({ id: 'mock-user-bob' })]]
          : [],
      );
    },
  );

  const writes: {
    route: string;
    prepare: () => Promise<unknown>;
    write: () => Promise<Response>;
    keys: () => string[];
  }[] = [
    {
      route: 'attachment upload',
      prepare: async () => {},
      write: () => attach('added.txt'),
      keys: () => ['decision_5'],
    },
    {
      route: 'attachment removal',
      prepare: () => attach('removed.txt'),
      write: async () =>
        app.request(`${base}/cards/decision_5/attachments/removed.txt`, {
          method: 'DELETE',
          headers: asBob,
        }),
      keys: () => ['decision_5'],
    },
    {
      route: 'link creation',
      prepare: async () => {},
      write: () => addLink('created'),
      keys: () => ['decision_5', 'decision_6'],
    },
    {
      route: 'link removal',
      prepare: () => addLink('removed'),
      write: async () =>
        app.request(`${base}/cards/decision_5/links`, {
          method: 'DELETE',
          ...json({ ...link, direction: 'outbound', description: 'removed' }),
        }),
      keys: () => ['decision_5', 'decision_6'],
    },
    {
      route: 'link update',
      prepare: () => addLink('before'),
      write: async () =>
        app.request(`${base}/cards/decision_5/links`, {
          method: 'PUT',
          ...json({
            ...link,
            toCard: retargeted,
            direction: 'outbound',
            description: 'after',
            previousToCard: link.toCard,
            previousLinkType: link.linkType,
            previousDirection: 'outbound',
            previousDescription: 'before',
          }),
        }),
      keys: () => ['decision_5', retargeted, 'decision_6'],
    },
  ];

  test.each(writes)(
    '$route notifies the cards it wrote',
    async ({ prepare, write, keys }) => {
      await prepare();
      notify.mockClear();
      expect((await write()).status).toBe(200);
      expect(notify.mock.calls.map(([notified]) => notified)).toEqual([keys()]);
    },
  );
});
