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
import { X_HONO_DISABLE_SSG_HEADER_KEY } from 'hono/ssg';
import type { SSEMessage } from 'hono/streaming';
import { createApp } from '../src/app.js';
import { MockAuthProvider } from '../src/auth/mock.js';
import { ProjectEvents } from '../src/domain/events/project-events.js';
import { ProjectRegistry } from '../src/project-registry.js';
import { createTempTestData, cleanupTempTestData } from './test-utils.js';

let app: ReturnType<typeof createApp>;
let tempTestDataPath: string;
let commands: CommandManager;
let registry: ProjectRegistry;
// Not exported by hono; the env key toSSG sets on the requests it makes.
const SSG_CONTEXT = 'HONO_SSG_CONTEXT';
const readers: ReadableStreamDefaultReader<Uint8Array>[] = [];
const base = '/api/projects/decision';

beforeAll(async () => {
  process.argv = [];
  tempTestDataPath = await createTempTestData('decision-records');
  commands = await CommandManager.getInstance(tempTestDataPath);
  registry = ProjectRegistry.fromCommandManager(commands);
  app = createApp(new MockAuthProvider({ roster: true }), registry);
});
afterEach(async () => {
  await Promise.all(readers.splice(0).map((reader) => reader.cancel()));
  vi.useRealTimers();
});
afterAll(async () => {
  registry.dispose();
  await cleanupTempTestData(tempTestDataPath);
});

async function nextEvent(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  name: string,
  timeoutMs = 2000,
) {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Missing ${name}`)), timeoutMs);
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

/** A short window is enough: delivery is synchronous with the write. */
async function noEvent(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  name: string,
) {
  await expect(nextEvent(reader, name, 300)).rejects.toThrow(`Missing ${name}`);
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
  return app.request(`${base}/events/presence`, {
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
  test('a reader joins presence but is never told who is on the card', async () => {
    const { reader: carolStream, ready: carolReady } = await connect('carol');
    const { reader: bobStream, ready: bobReady } = await connect('bob');
    expect(carolReady).toEqual({ connectionId: expect.any(String) });

    expect(
      (await presence(carolReady.connectionId, 'decision_5', 1, 'carol'))
        .status,
    ).toBe(204);
    expect(
      (await presence(bobReady.connectionId, 'decision_5', 1, 'bob')).status,
    ).toBe(204);

    expect(await nextEvent(bobStream, 'presence.updated')).toEqual({
      cardKey: 'decision_5',
      users: [
        { userId: 'mock-user-carol', userName: 'Carol', mode: 'viewing' },
        { userId: 'mock-user-bob', userName: 'Bob', mode: 'viewing' },
      ],
    });
    await noEvent(carolStream, 'presence.updated');
  });

  test('connection IDs are bound to their user and invalid cards are rejected', async () => {
    const { ready } = await connect();
    expect(
      (await presence(ready.connectionId, 'decision_5', 1, 'bob')).status,
    ).toBe(404);
    expect((await presence(ready.connectionId, 'missing')).status).toBe(404);
  });

  test('card.updated withholds identity below Editor', async () => {
    const { reader: carolStream, ready: carolReady } = await connect('carol');
    const { reader: bobStream, ready: bobReady } = await connect('bob');
    expect(
      (await presence(carolReady.connectionId, 'decision_5', 1, 'carol'))
        .status,
    ).toBe(204);
    expect(
      (await presence(bobReady.connectionId, 'decision_5', 1, 'bob')).status,
    ).toBe(204);

    const written = {
      content: 'Written content',
      metadata: { title: 'Written content' },
    };
    expect((await patch('decision_5', written, 'alice')).status).toBe(200);
    expect(await nextEvent(carolStream, 'card.updated')).toEqual({
      cardKey: 'decision_5',
    });
    expect(await nextEvent(bobStream, 'card.updated')).toEqual({
      cardKey: 'decision_5',
      userId: 'mock-user-alice',
      userName: 'Alice',
    });
  });

  test('static generation skips the event stream', async () => {
    const response = await app.request(
      `${base}/events`,
      { headers: { cookie: 'mock-user=alice' } },
      { [SSG_CONTEXT]: true },
    );
    expect(response.status).toBe(404);
    expect(response.headers.get(X_HONO_DISABLE_SSG_HEADER_KEY)).toBe('true');
  });

  test('disposal closes subscriptions', async () => {
    // Needs an instance it can dispose without touching the shared app.
    const ownCommands = new CommandManager(tempTestDataPath);
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

const fullCapabilities = {
  canSeeIdentity: true,
  canDeclareEditing: true,
  canSeePresence: true,
};
const readerCapabilities = {
  canSeeIdentity: false,
  canDeclareEditing: false,
  canSeePresence: false,
};

describe('presence bookkeeping', () => {
  function setup() {
    const events = new ProjectEvents();
    const messages: SSEMessage[] = [];
    const user = { id: 'same-user', name: 'Alice' };
    const connect = () =>
      events.connect(
        user,
        fullCapabilities,
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
    const { events, connect, latest, messages } = setup();
    try {
      const first = connect();
      const second = connect();
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
      const delivered = messages.length;
      events.disconnect(first);
      // Nobody is left subscribed to decision_5, so the vacancy reaches no one.
      expect(messages).toHaveLength(delivered);
      expect(
        events.update(first, 'same-user', 3, 'decision_5', 'editing'),
      ).toBe(false);
    } finally {
      events.dispose();
    }
  });

  test('a connection subscribed to one card hears nothing about another', () => {
    const events = new ProjectEvents();
    const onDecision5: SSEMessage[] = [];
    const onDecision6: SSEMessage[] = [];
    const admin = { id: 'admin', name: 'Admin' };
    try {
      const five = events.connect(
        admin,
        fullCapabilities,
        (m) => onDecision5.push(m),
        () => {},
      );
      const six = events.connect(
        admin,
        fullCapabilities,
        (m) => onDecision6.push(m),
        () => {},
      );
      events.update(five, admin.id, 1, 'decision_5', 'viewing');
      events.update(six, admin.id, 1, 'decision_6', 'viewing');
      onDecision5.length = 0;
      onDecision6.length = 0;

      events.update(six, admin.id, 2, 'decision_6', 'editing');
      events.cardsUpdated(['decision_6'], admin);

      expect(onDecision5).toEqual([]);
      expect(onDecision6.map((m) => m.event)).toEqual([
        'presence.updated',
        'card.updated',
      ]);
    } finally {
      events.dispose();
    }
  });

  test("a reader's editing declaration is stored and broadcast as viewing", () => {
    const events = new ProjectEvents();
    const editorMessages: SSEMessage[] = [];
    const readerMessages: SSEMessage[] = [];
    const editor = { id: 'mock-user-bob', name: 'Bob' };
    const reader = { id: 'mock-user-carol', name: 'Carol' };
    try {
      const editorConn = events.connect(
        editor,
        fullCapabilities,
        (m) => editorMessages.push(m),
        () => {},
      );
      const readerConn = events.connect(
        reader,
        readerCapabilities,
        (m) => readerMessages.push(m),
        () => {},
      );
      events.update(editorConn, editor.id, 1, 'decision_5', 'viewing');
      events.update(readerConn, reader.id, 1, 'decision_5', 'editing');

      const latest = JSON.parse(
        String(
          editorMessages.filter((m) => m.event === 'presence.updated').at(-1)!
            .data,
        ),
      );
      expect(latest.users).toEqual([
        { userId: 'mock-user-bob', userName: 'Bob', mode: 'viewing' },
        { userId: 'mock-user-carol', userName: 'Carol', mode: 'viewing' },
      ]);
      expect(
        readerMessages.filter((m) => m.event === 'presence.updated'),
      ).toEqual([]);
    } finally {
      events.dispose();
    }
  });

  test('new subscribers receive no presence, even with other cards occupied', () => {
    const { events, connect, latest } = setup();
    try {
      events.update(connect(), 'same-user', 1, 'decision_5', 'editing');
      connect();
      expect(latest('ready')).toEqual({ connectionId: expect.any(String) });
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
    const { events, connect, latest, messages } = setup();
    try {
      const connection = connect();
      events.update(connection, 'same-user', 1, 'decision_5', 'viewing');
      vi.advanceTimersByTime(60_000);
      events.update(connection, 'same-user', 2, 'decision_5', 'viewing');
      vi.advanceTimersByTime(60_000);
      expect(latest('presence.updated').users).toHaveLength(1);
      vi.advanceTimersByTime(30_000);
      const delivered = messages.length;
      // Sole subscriber, so expiry reaches no one; rejoin proves it lapsed.
      events.update(connection, 'same-user', 3, 'decision_5', 'viewing');
      expect(messages.length).toBeGreaterThan(delivered);
      expect(latest('presence.updated').users).toEqual([
        { userId: 'same-user', userName: 'Alice', mode: 'viewing' },
      ]);
    } finally {
      events.dispose();
    }
  });

  test('a card named twice by one write is notified once', () => {
    const { events, connect, messages, user } = setup();
    try {
      const connectionId = connect();
      events.update(connectionId, user.id, 1, 'decision_5', 'viewing');
      messages.length = 0;
      events.cardsUpdated(['decision_5', 'decision_6', 'decision_5'], user);
      expect(
        messages.map((message) => JSON.parse(String(message.data)).cardKey),
      ).toEqual(['decision_5']);
    } finally {
      events.dispose();
    }
  });

  test('a remaining subscriber observes every departure from the card', () => {
    vi.useFakeTimers();
    const events = new ProjectEvents();
    const aMessages: SSEMessage[] = [];
    const a = { id: 'a', name: 'A' };
    const b = { id: 'b', name: 'B' };
    const latestA = (event: string) =>
      JSON.parse(
        String(aMessages.filter((m) => m.event === event).at(-1)!.data),
      );
    try {
      const aConn = events.connect(
        a,
        fullCapabilities,
        (m) => aMessages.push(m),
        () => {},
      );
      const bConn = events.connect(
        b,
        fullCapabilities,
        () => {},
        () => {},
      );
      events.update(aConn, a.id, 1, 'decision_5', 'viewing');
      events.update(bConn, b.id, 1, 'decision_5', 'viewing');

      events.update(bConn, b.id, 2, 'decision_5', 'editing');
      expect(latestA('presence.updated').users).toEqual([
        { userId: 'a', userName: 'A', mode: 'viewing' },
        { userId: 'b', userName: 'B', mode: 'editing' },
      ]);

      events.update(bConn, b.id, 3, null, 'viewing');
      expect(latestA('presence.updated').users).toEqual([
        { userId: 'a', userName: 'A', mode: 'viewing' },
      ]);

      events.update(bConn, b.id, 4, 'decision_5', 'viewing');
      vi.advanceTimersByTime(60_000);
      events.update(aConn, a.id, 2, 'decision_5', 'viewing');
      vi.advanceTimersByTime(30_000);
      expect(latestA('presence.updated').users).toEqual([
        { userId: 'a', userName: 'A', mode: 'viewing' },
      ]);
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
