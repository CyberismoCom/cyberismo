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
import { createApp } from '../src/app.js';
import { ProjectRegistry } from '../src/project-registry.js';
import { MockAuthProvider } from '../src/auth/mock.js';
import { ProjectEvents } from '../src/project-events.js';
import { UserRole } from '../src/types.js';
import type { SSEMessage } from 'hono/streaming';
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
  app = createApp(new MockAuthProvider(), registry);
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
        let text = '';
        const decoder = new TextDecoder();
        while (true) {
          const { value, done } = await reader.read();
          if (done) throw new Error('Stream closed');
          text += decoder.decode(value, { stream: true });
          const blocks = text.split('\n\n');
          text = blocks.pop()!;
          for (const block of blocks) {
            if (block.includes(`event: ${name}\n`)) {
              return JSON.parse(
                block
                  .split('\n')
                  .find((line) => line.startsWith('data: '))!
                  .slice(6),
              );
            }
          }
        }
      })(),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}
async function connect(user = 'alice') {
  const response = await app.request(`${base}/events`, {
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

describe('project stream', () => {
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
    expect((await app.request('/api/projects/missing/events')).status).toBe(
      404,
    );
  });

  test('HTTP writes broadcast even with presence disabled', async () => {
    vi.stubEnv('APP_PRESENCE_ENABLED', 'false');
    const { reader, ready } = await connect();
    expect((await presence(ready.connectionId, 'decision_5')).status).toBe(204);
    const response = await app.request(`${base}/cards/decision_5`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ metadata: { title: 'Project event' } }),
    });
    expect(response.status).toBe(200);
    expect(await nextEvent(reader, 'card.updated')).toEqual({
      cardKey: 'decision_5',
      userId: 'mock-user',
      userName: 'Local Admin',
    });
    const second = await connect('bob');
    expect(second.ready.presence).toEqual({});
  });

  test('direct commands do not emit UI notifications', async () => {
    const messages: SSEMessage[] = [];
    const events = registry.eventsFor(commands);
    const id = events.connect(
      { id: 'observer', name: 'Observer', email: '', role: UserRole.Reader },
      (message) => messages.push(message),
      () => {},
    );
    messages.length = 0;
    try {
      await commands.editCmd.editCardContent('decision_5', 'Direct command');
      expect(messages).toEqual([]);
    } finally {
      events.disconnect(id);
    }
  });

  test('disposal closes subscriptions', async () => {
    const { reader } = await connect();
    registry.dispose();
    expect((await reader.read()).done).toBe(true);
    // Restore the registry for later tests without reusing a disposed broadcaster.
    registry = ProjectRegistry.fromCommandManager(commands);
    app = createApp(new MockAuthProvider(), registry);
  });
});

describe('presence snapshots', () => {
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
    const latest = () =>
      JSON.parse(
        String(
          messages.filter((m) => m.event === 'presence.updated').at(-1)!.data,
        ),
      );
    return { events, messages, connect, latest };
  }

  test('deduplicates tabs, prefers editing, and ignores delayed updates', () => {
    const { events, connect, latest } = setup();
    try {
      const a = connect();
      const b = connect();
      connect();
      events.update(a, 'same-user', 1, 'shared_1', 'viewing');
      events.update(b, 'same-user', 2, 'shared_1', 'editing');
      events.update(b, 'same-user', 1, null, 'viewing');
      expect(latest().users).toEqual([
        { userId: 'same-user', userName: 'Alice', mode: 'editing' },
      ]);
      events.disconnect(b);
      expect(latest().users[0].mode).toBe('viewing');
      events.disconnect(a);
      expect(latest().users).toEqual([]);
      expect(events.update(a, 'same-user', 3, 'shared_1', 'editing')).toBe(
        false,
      );
    } finally {
      events.dispose();
    }
  });

  test('new subscribers receive all occupied cards and projects remain isolated', () => {
    const first = setup();
    const second = setup();
    try {
      first.events.update(
        first.connect(),
        'same-user',
        1,
        'module_1',
        'editing',
      );
      first.connect();
      second.connect();
      expect(
        JSON.parse(String(first.messages.at(-1)!.data)).presence.module_1,
      ).toHaveLength(1);
      expect(JSON.parse(String(second.messages.at(-1)!.data)).presence).toEqual(
        {},
      );
    } finally {
      first.events.dispose();
      second.events.dispose();
    }
  });

  test('presence expires unless renewed', () => {
    vi.useFakeTimers();
    const { events, connect, latest } = setup();
    try {
      const id = connect();
      events.update(id, 'same-user', 1, 'shared_1', 'viewing');
      vi.advanceTimersByTime(60_000);
      events.update(id, 'same-user', 2, 'shared_1', 'viewing');
      vi.advanceTimersByTime(60_000);
      expect(latest().users).toHaveLength(1);
      vi.advanceTimersByTime(30_000);
      expect(latest().users).toEqual([]);
    } finally {
      events.dispose();
    }
  });
});

describe('explicit card update notifications', () => {
  let notify: MockInstance<ProjectEvents['cardsUpdated']>;
  const asBob = { cookie: 'mock-user=bob' };
  const json = (body: unknown) => ({
    headers: { 'content-type': 'application/json', ...asBob },
    body: JSON.stringify(body),
  });
  const notifiedKeys = () => notify.mock.calls.flatMap(([keys]) => keys).sort();

  beforeEach(() => {
    notify = vi.spyOn(registry.eventsFor(commands), 'cardsUpdated');
  });

  afterEach(() => {
    notify.mockRestore();
  });

  test('PATCH emits once for a real change and never for a no-op body', async () => {
    for (const body of [{}, { metadata: {} }]) {
      const res = await app.request('/api/projects/decision/cards/decision_5', {
        method: 'PATCH',
        ...json(body),
      });
      expect(res.status).toBe(200);
    }
    expect(notify).not.toHaveBeenCalled();

    const res = await app.request('/api/projects/decision/cards/decision_5', {
      method: 'PATCH',
      ...json({ metadata: { title: 'Emits once' } }),
    });
    expect(res.status).toBe(200);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      ['decision_5'],
      expect.objectContaining({ id: 'mock-user-bob' }),
    );
  });

  test('attachment upload and removal both emit for the card', async () => {
    const form = new FormData();
    form.append(
      'files',
      new Blob(['hello'], { type: 'text/plain' }),
      'note.txt',
    );
    const upload = await app.request(
      '/api/projects/decision/cards/decision_5/attachments',
      { method: 'POST', headers: asBob, body: form },
    );
    expect(upload.status).toBe(200);
    expect(notifiedKeys()).toEqual(['decision_5']);
    notify.mockClear();

    const remove = await app.request(
      '/api/projects/decision/cards/decision_5/attachments/note.txt',
      { method: 'DELETE', headers: asBob },
    );
    expect(remove.status).toBe(200);
    expect(notifiedKeys()).toEqual(['decision_5']);
  });

  test('link removal emits for both endpoint cards', async () => {
    const link = {
      toCard: 'decision_6',
      linkType: 'decision/linkTypes/test',
      direction: 'outbound',
    };
    const create = await app.request(
      '/api/projects/decision/cards/decision_5/links',
      { method: 'POST', ...json(link) },
    );
    expect(create.status).toBe(200);
    notify.mockClear();

    const remove = await app.request(
      '/api/projects/decision/cards/decision_5/links',
      { method: 'DELETE', ...json(link) },
    );
    expect(remove.status).toBe(200);
    expect(notifiedKeys()).toEqual(['decision_5', 'decision_6']);
  });

  test('link update emits for both endpoints and the previous target', async () => {
    const [third] = await commands.createCmd.createCard(
      'decision/templates/decision',
      'decision_5',
    );
    const previous = {
      toCard: 'decision_6',
      linkType: 'decision/linkTypes/test',
      direction: 'outbound',
    };
    const create = await app.request(
      '/api/projects/decision/cards/decision_5/links',
      { method: 'POST', ...json(previous) },
    );
    expect(create.status).toBe(200);
    notify.mockClear();

    const update = await app.request(
      '/api/projects/decision/cards/decision_5/links',
      {
        method: 'PUT',
        ...json({
          toCard: third.key,
          linkType: previous.linkType,
          direction: 'outbound',
          previousToCard: previous.toCard,
          previousLinkType: previous.linkType,
          previousDirection: previous.direction,
        }),
      },
    );
    expect(update.status).toBe(200);
    expect(notifiedKeys()).toEqual(
      ['decision_5', 'decision_6', third.key].sort(),
    );
  });
});
