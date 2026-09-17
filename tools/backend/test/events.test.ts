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
import type { AuthProvider } from '../src/auth/types.js';
import { MockAuthProvider } from '../src/auth/mock.js';
import { boundedSend } from '../src/domain/events/bounded-send.js';
import { computeLifetimeMs } from '../src/domain/events/lifetime.js';
import { ProjectEvents } from '../src/domain/events/project-events.js';
import { ProjectRegistry } from '../src/project-registry.js';
import { UserRole } from '../src/types.js';
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

function decode(chunk: ReadableStreamReadResult<Uint8Array>): string {
  return new TextDecoder().decode(chunk.value);
}

async function drainEventNames(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<string[]> {
  const decoder = new TextDecoder();
  let text = '';
  const names: string[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return names;
    text += decoder.decode(value, { stream: true });
    const blocks = text.split('\n\n');
    text = blocks.pop()!;
    for (const block of blocks) {
      const name = block.match(/^event: (.+)$/m)?.[1];
      if (name) names.push(name);
    }
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

/** A synchronous send/close/terminate triple for ProjectEvents.connect() in tests. */
function testCallbacks(
  target: SSEMessage[] = [],
): [
  (message: SSEMessage) => boolean,
  () => void,
  (message: SSEMessage) => void,
] {
  const send = (message: SSEMessage) => {
    target.push(message);
    return true;
  };
  const close = () => {};
  const terminate = (message: SSEMessage) => {
    send(message);
    close();
  };
  return [send, close, terminate];
}

describe('project event stream over HTTP', () => {
  test('reader joins presence through HTTP and is told who is on the card', async () => {
    const { reader, ready } = await connect('carol');
    expect(ready).toEqual({ connectionId: expect.any(String) });

    expect(
      (await presence(ready.connectionId, 'decision_5', 1, 'carol')).status,
    ).toBe(204);
    expect(await nextEvent(reader, 'presence.updated')).toEqual({
      cardKey: 'decision_5',
      users: [
        { userId: 'mock-user-carol', userName: 'Carol', mode: 'viewing' },
      ],
    });
  });

  test('the heartbeat is a named hb event', async () => {
    vi.useFakeTimers();
    const { reader } = await connect();
    vi.advanceTimersByTime(30_000);
    expect(decode(await reader.read())).toBe('event: hb\ndata: \n\n');
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

const fullCapabilities = { canSeeIdentity: true, canDeclareEditing: true };

describe('presence bookkeeping', () => {
  function setup() {
    const events = new ProjectEvents();
    const messages: SSEMessage[] = [];
    const user = { id: 'same-user', name: 'Alice' };
    const connect = () =>
      events.connect(user, fullCapabilities, ...testCallbacks(messages));
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

  test('a presence.updated dropped on write is not marked delivered, so an identical later broadcast still reaches it', () => {
    const events = new ProjectEvents();
    const heavy = { id: 'heavy3', name: 'Heavy3' };
    const writes1: SSEMessage[] = [];
    let dropNext = true;
    const send1 = (message: SSEMessage): boolean => {
      if (message.event === 'presence.updated' && dropNext) return false;
      writes1.push(message);
      return true;
    };
    try {
      const conn1 = events.connect(
        heavy,
        fullCapabilities,
        send1,
        () => {},
        () => {},
      );
      events.update(conn1, heavy.id, 1, 'decision_5', 'viewing');
      expect(writes1.some((m) => m.event === 'presence.updated')).toBe(false);

      dropNext = false;
      // A second connection for the same user, deduped by users() into the
      // same single-entry list the dropped write already held.
      const conn2 = events.connect(heavy, fullCapabilities, ...testCallbacks());
      events.update(conn2, heavy.id, 1, 'decision_5', 'viewing');

      const latest = writes1
        .filter((m) => m.event === 'presence.updated')
        .at(-1);
      expect(latest).toBeDefined();
      expect(JSON.parse(String(latest!.data)).users).toEqual([
        { userId: 'heavy3', userName: 'Heavy3', mode: 'viewing' },
      ]);
    } finally {
      events.dispose();
    }
  });

  test('a connection subscribed to one card hears nothing about another', () => {
    vi.useFakeTimers();
    const events = new ProjectEvents();
    const onDecision5: SSEMessage[] = [];
    const onDecision6: SSEMessage[] = [];
    const admin = { id: 'admin', name: 'Admin' };
    try {
      const five = events.connect(
        admin,
        fullCapabilities,
        ...testCallbacks(onDecision5),
      );
      const six = events.connect(
        admin,
        fullCapabilities,
        ...testCallbacks(onDecision6),
      );
      events.update(five, admin.id, 1, 'decision_5', 'viewing');
      events.update(six, admin.id, 1, 'decision_6', 'viewing');
      onDecision5.length = 0;
      onDecision6.length = 0;

      vi.advanceTimersByTime(1_000);
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
    const messages: SSEMessage[] = [];
    const reader = { id: 'mock-user-carol', name: 'Carol' };
    const capabilities = { canSeeIdentity: false, canDeclareEditing: false };
    try {
      const connectionId = events.connect(
        reader,
        capabilities,
        ...testCallbacks(messages),
      );
      events.update(connectionId, reader.id, 1, 'decision_5', 'editing');
      const latest = JSON.parse(
        String(
          messages.filter((m) => m.event === 'presence.updated').at(-1)!.data,
        ),
      );
      expect(latest.users).toEqual([
        { userId: 'mock-user-carol', userName: 'Carol', mode: 'viewing' },
      ]);
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
        ...testCallbacks(aMessages),
      );
      const bConn = events.connect(b, fullCapabilities, ...testCallbacks());
      events.update(aConn, a.id, 1, 'decision_5', 'viewing');
      events.update(bConn, b.id, 1, 'decision_5', 'viewing');

      vi.advanceTimersByTime(30_000);
      events.update(bConn, b.id, 2, 'decision_5', 'editing');
      expect(latestA('presence.updated').users).toEqual([
        { userId: 'a', userName: 'A', mode: 'viewing' },
        { userId: 'b', userName: 'B', mode: 'editing' },
      ]);

      vi.advanceTimersByTime(30_000);
      events.update(bConn, b.id, 3, null, 'viewing');
      expect(latestA('presence.updated').users).toEqual([
        { userId: 'a', userName: 'A', mode: 'viewing' },
      ]);

      vi.advanceTimersByTime(30_000);
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

  test('a second card/mode change inside the minimum interval is applied once the interval elapses, not discarded', () => {
    vi.useFakeTimers();
    const { events, connect, latest, messages } = setup();
    try {
      const connection = connect();
      events.update(connection, 'same-user', 1, 'decision_5', 'viewing');
      messages.length = 0;

      expect(
        events.update(connection, 'same-user', 2, 'decision_6', 'viewing'),
      ).toBe(true);
      expect(messages).toHaveLength(0);

      vi.advanceTimersByTime(1_000);
      expect(latest('presence.updated').cardKey).toBe('decision_6');
    } finally {
      events.dispose();
    }
  });

  test('a throttled departure still applies once the interval elapses, so a remaining subscriber sees the vacancy', () => {
    vi.useFakeTimers();
    const events = new ProjectEvents();
    const observed: SSEMessage[] = [];
    const observer = { id: 'observer3', name: 'Observer3' };
    const leaver = { id: 'leaver', name: 'Leaver' };
    try {
      const observerConn = events.connect(
        observer,
        fullCapabilities,
        ...testCallbacks(observed),
      );
      const leaverConn = events.connect(
        leaver,
        fullCapabilities,
        ...testCallbacks(),
      );
      events.update(observerConn, observer.id, 1, 'decision_5', 'viewing');
      events.update(leaverConn, leaver.id, 1, 'decision_5', 'viewing');
      observed.length = 0;

      events.update(leaverConn, leaver.id, 2, null, 'viewing');
      expect(observed).toEqual([]);

      vi.advanceTimersByTime(1_000);
      const latest = JSON.parse(
        String(
          observed.filter((m) => m.event === 'presence.updated').at(-1)!.data,
        ),
      );
      expect(latest.users).toEqual([
        { userId: 'observer3', userName: 'Observer3', mode: 'viewing' },
      ]);
    } finally {
      events.dispose();
    }
  });

  test('a renewal does not reset the movement clock, so a later real move is not needlessly deferred', () => {
    vi.useFakeTimers();
    const { events, connect, latest, messages } = setup();
    try {
      const connection = connect();
      events.update(connection, 'same-user', 1, 'decision_5', 'viewing');

      // A heartbeat-driven renewal at 900ms, unrelated to any real movement.
      vi.advanceTimersByTime(900);
      events.update(connection, 'same-user', 2, 'decision_5', 'viewing');

      // Only 200ms after the renewal, but past 1s since the original move.
      vi.advanceTimersByTime(200);
      messages.length = 0;
      events.update(connection, 'same-user', 3, 'decision_6', 'viewing');
      expect(latest('presence.updated').cardKey).toBe('decision_6');
    } finally {
      events.dispose();
    }
  });
});

describe('stream rotation', () => {
  test('the stream closes at its computed lifetime, sending `rotating` last', async () => {
    vi.useFakeTimers();
    // Whole-second-aligned so exp (epoch seconds) round-trips exactly, and
    // 75s life keeps the ~45s rotation clear of the 30s heartbeat ticks.
    const now = Math.floor(Date.now() / 1000) * 1000;
    const provider: AuthProvider = {
      authenticate: async () => ({
        id: 'exp-user',
        email: 'exp-user@example.com',
        name: 'Exp User',
        role: UserRole.Reader,
        exp: now / 1000 + 75,
      }),
    };
    const { reader } = await connect(
      'irrelevant',
      createApp(provider, registry),
    );
    vi.advanceTimersByTime(50_000);
    const names = await drainEventNames(reader);
    expect(names.at(-1)).toBe('rotating');
  });

  test('jitter never pushes the lifetime past exp minus the margin', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(1);
    try {
      const now = Date.now();
      const exp = Math.floor(now / 1000) + 60;
      const margin = exp * 1000 - now - 30_000;
      expect(computeLifetimeMs(exp, now)).toBe(margin);
    } finally {
      spy.mockRestore();
    }
  });

  test('a token inside (or past) the rotation margin rotates at its own expiry, never negative', () => {
    const now = Math.floor(Date.now() / 1000) * 1000;
    expect(computeLifetimeMs(now / 1000 + 10, now)).toBe(10_000);
    expect(computeLifetimeMs(now / 1000 - 5, now)).toBe(0);
  });

  function setup() {
    const events = new ProjectEvents();
    const observed: SSEMessage[] = [];
    const observer = { id: 'observer', name: 'Observer' };
    const rotating = { id: 'rotating', name: 'Rotating' };
    const observerConn = events.connect(
      observer,
      fullCapabilities,
      ...testCallbacks(observed),
    );
    return { events, observed, observer, rotating, observerConn };
  }

  test('a retiring connection keeps its presence: the observer sees no update, and the reconnecting connection is told the current list', () => {
    const { events, observed, observer, rotating, observerConn } = setup();
    try {
      const oldConn = events.connect(
        rotating,
        fullCapabilities,
        ...testCallbacks(),
      );
      events.update(observerConn, observer.id, 1, 'decision_5', 'viewing');
      events.update(oldConn, rotating.id, 1, 'decision_5', 'viewing');
      observed.length = 0;

      events.retire(oldConn);
      const newMessages: SSEMessage[] = [];
      const newConn = events.connect(
        rotating,
        fullCapabilities,
        ...testCallbacks(newMessages),
      );
      events.update(newConn, rotating.id, 1, 'decision_5', 'viewing');

      expect(observed).toEqual([]);
      const presenceMessages = newMessages.filter(
        (m) => m.event === 'presence.updated',
      );
      expect(presenceMessages).toHaveLength(1);
      expect(JSON.parse(String(presenceMessages[0].data)).users).toEqual([
        { userId: 'observer', userName: 'Observer', mode: 'viewing' },
        { userId: 'rotating', userName: 'Rotating', mode: 'viewing' },
      ]);
    } finally {
      events.dispose();
    }
  });

  test("users() sorting keeps the serialization stable when expire() later deletes the connection that anchored a user's array position", () => {
    vi.useFakeTimers();
    const events = new ProjectEvents();
    const observed: SSEMessage[] = [];
    const observer = { id: 'observer', name: 'Observer' };
    const rotating = { id: 'rotating', name: 'Rotating' };
    try {
      // rotating's connection is created first, so it alone determines
      // where 'rotating' lands in the unsorted dedup order below.
      const oldConn = events.connect(
        rotating,
        fullCapabilities,
        ...testCallbacks(),
      );
      const observerConn = events.connect(
        observer,
        fullCapabilities,
        ...testCallbacks(observed),
      );
      events.update(oldConn, rotating.id, 1, 'decision_5', 'viewing');
      events.update(observerConn, observer.id, 1, 'decision_5', 'viewing');

      events.retire(oldConn);
      const newConn = events.connect(
        rotating,
        fullCapabilities,
        ...testCallbacks(),
      );
      events.update(newConn, rotating.id, 1, 'decision_5', 'viewing');
      observed.length = 0;

      vi.advanceTimersByTime(60_000);
      // Renew the two live connections; the retired one never renews, so
      // only its 90s lease lapses and expire() deletes it.
      events.update(observerConn, observer.id, 2, 'decision_5', 'viewing');
      events.update(newConn, rotating.id, 2, 'decision_5', 'viewing');
      vi.advanceTimersByTime(30_000);

      expect(observed).toEqual([]);
    } finally {
      events.dispose();
    }
  });

  test('switching cards is delivered even when the new card happens to serialize identically to the old one', () => {
    vi.useFakeTimers();
    const events = new ProjectEvents();
    const c = { id: 'c', name: 'C' };
    const other = { id: 'other', name: 'Other' };
    const messages: SSEMessage[] = [];
    try {
      const cConn = events.connect(
        c,
        fullCapabilities,
        ...testCallbacks(messages),
      );
      const otherOnFive = events.connect(
        other,
        fullCapabilities,
        ...testCallbacks(),
      );
      const otherOnSix = events.connect(
        other,
        fullCapabilities,
        ...testCallbacks(),
      );
      events.update(otherOnFive, other.id, 1, 'decision_5', 'viewing');
      events.update(otherOnSix, other.id, 1, 'decision_6', 'viewing');
      events.update(cConn, c.id, 1, 'decision_5', 'viewing');
      messages.length = 0;

      // Both cards now hold identical occupancy ([c, other] viewing), so a
      // naive card-agnostic dedup would wrongly suppress this delivery.
      vi.advanceTimersByTime(1_000);
      events.update(cConn, c.id, 2, 'decision_6', 'viewing');
      const onSix = messages.some(
        (m) =>
          m.event === 'presence.updated' &&
          JSON.parse(String(m.data)).cardKey === 'decision_6',
      );
      expect(onSix).toBe(true);
    } finally {
      events.dispose();
    }
  });

  test('update() rejects a retired connection, even mid-lease', () => {
    const { events, observer, observerConn } = setup();
    try {
      events.update(observerConn, observer.id, 1, 'decision_5', 'viewing');
      events.retire(observerConn);
      expect(
        events.update(observerConn, observer.id, 2, 'decision_5', 'viewing'),
      ).toBe(false);
    } finally {
      events.dispose();
    }
  });

  test('expire() deletes retired connections instead of leaking them', () => {
    vi.useFakeTimers();
    const { events, observer, observerConn } = setup();
    try {
      events.update(observerConn, observer.id, 1, 'decision_5', 'viewing');
      events.retire(observerConn);
      vi.advanceTimersByTime(120_000);
      expect(
        events.update(observerConn, observer.id, 2, 'decision_5', 'viewing'),
      ).toBe(false);
    } finally {
      events.dispose();
    }
  });
});

describe('connection cap', () => {
  const admin = (id: string) => ({ id, name: id });

  test('caps a user at 30 connections, evicting the oldest with `capped`, and leaves the rest untouched', () => {
    const events = new ProjectEvents();
    const user = admin('heavy-user');
    const messagesByConnection: SSEMessage[][] = [];
    const connectionIds: string[] = [];
    try {
      for (let i = 0; i < 30; i++) {
        const messages: SSEMessage[] = [];
        messagesByConnection.push(messages);
        connectionIds.push(
          events.connect(user, fullCapabilities, ...testCallbacks(messages)),
        );
      }
      const newMessages: SSEMessage[] = [];
      events.connect(user, fullCapabilities, ...testCallbacks(newMessages));

      expect(messagesByConnection[0].map((m) => m.event)).toEqual([
        'ready',
        'capped',
      ]);
      for (let i = 1; i < 30; i++) {
        expect(messagesByConnection[i].some((m) => m.event === 'capped')).toBe(
          false,
        );
      }
      expect(newMessages.map((m) => m.event)).toEqual(['ready']);
      expect(
        events.update(connectionIds[0], user.id, 1, 'decision_5', 'viewing'),
      ).toBe(false);
    } finally {
      events.dispose();
    }
  });

  test('the eviction victim skips an editing connection in favor of the oldest non-editing one', () => {
    const events = new ProjectEvents();
    const user = admin('editing-user');
    const messagesByConnection: SSEMessage[][] = [];
    const connectionIds: string[] = [];
    try {
      for (let i = 0; i < 30; i++) {
        const messages: SSEMessage[] = [];
        messagesByConnection.push(messages);
        connectionIds.push(
          events.connect(user, fullCapabilities, ...testCallbacks(messages)),
        );
      }
      // The oldest connection is mid-edit; the next-oldest should be spared it.
      events.update(connectionIds[0], user.id, 1, 'decision_5', 'editing');

      events.connect(user, fullCapabilities, ...testCallbacks());

      expect(messagesByConnection[0].some((m) => m.event === 'capped')).toBe(
        false,
      );
      expect(messagesByConnection[1].some((m) => m.event === 'capped')).toBe(
        true,
      );
    } finally {
      events.dispose();
    }
  });

  test('evicting a connection notifies a remaining subscriber of the departure', () => {
    const events = new ProjectEvents();
    const heavy = admin('heavy-user2');
    const observer = admin('observer2');
    const observed: SSEMessage[] = [];
    try {
      const observerConn = events.connect(
        observer,
        fullCapabilities,
        ...testCallbacks(observed),
      );
      events.update(observerConn, observer.id, 1, 'decision_5', 'viewing');

      const connectionIds: string[] = [];
      for (let i = 0; i < 30; i++) {
        connectionIds.push(
          events.connect(heavy, fullCapabilities, ...testCallbacks()),
        );
      }
      events.update(connectionIds[0], heavy.id, 1, 'decision_5', 'viewing');
      observed.length = 0;

      events.connect(heavy, fullCapabilities, ...testCallbacks());

      const latest = JSON.parse(
        String(
          observed.filter((m) => m.event === 'presence.updated').at(-1)!.data,
        ),
      );
      expect(latest.users).toEqual([
        { userId: 'observer2', userName: 'observer2', mode: 'viewing' },
      ]);
    } finally {
      events.dispose();
    }
  });

  test('a retired connection does not count toward the cap, so it never evicts a live one to make room', () => {
    const events = new ProjectEvents();
    const user = admin('rotating-user');
    const messagesByConnection: SSEMessage[][] = [];
    const connectionIds: string[] = [];
    try {
      for (let i = 0; i < 30; i++) {
        const messages: SSEMessage[] = [];
        messagesByConnection.push(messages);
        connectionIds.push(
          events.connect(user, fullCapabilities, ...testCallbacks(messages)),
        );
      }
      events.retire(connectionIds[0]);

      const newMessages: SSEMessage[] = [];
      events.connect(user, fullCapabilities, ...testCallbacks(newMessages));

      for (let i = 1; i < 30; i++) {
        expect(messagesByConnection[i].some((m) => m.event === 'capped')).toBe(
          false,
        );
      }
      expect(newMessages.map((m) => m.event)).toEqual(['ready']);
    } finally {
      events.dispose();
    }
  });

  test('capping a connection over HTTP delivers `capped` before the stream closes', async () => {
    const first = await connect('alice');
    for (let i = 1; i < 30; i++) await connect('alice');
    await connect('alice');

    expect(await drainEventNames(first.reader)).toEqual(['capped']);
  });
});

describe('write backpressure', () => {
  function deferred() {
    let settle: () => void = () => {};
    const promise = new Promise<void>((resolve) => {
      settle = resolve;
    });
    return { promise, resolve: settle };
  }

  test('drops presence updates once too many writes are outstanding, and resumes once they drain', async () => {
    const pending: ReturnType<typeof deferred>[] = [];
    const write = vi.fn((): Promise<void> => {
      const d = deferred();
      pending.push(d);
      return d.promise;
    });
    const send = boundedSend(
      write,
      (message) => message.event === 'presence.updated',
    );
    const presence = (n: number) => ({
      event: 'presence.updated',
      data: String(n),
    });

    for (let i = 0; i < 20; i++) send(presence(i));
    expect(write).toHaveBeenCalledTimes(20);

    send(presence(20));
    expect(write).toHaveBeenCalledTimes(20);

    send({ event: 'card.updated', data: 'x' });
    expect(write).toHaveBeenCalledTimes(21);

    pending.shift()!.resolve();
    pending.shift()!.resolve();
    for (let i = 0; i < 5; i++) await Promise.resolve();

    send(presence(21));
    expect(write).toHaveBeenCalledTimes(22);
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
