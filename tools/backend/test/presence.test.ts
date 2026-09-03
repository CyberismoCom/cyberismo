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
import { CommandManager } from '@cyberismo/data-handler';
import { createApp } from '../src/app.js';
import { ProjectRegistry } from '../src/project-registry.js';
import { MockAuthProvider } from '../src/auth/mock.js';
import { presenceStore } from '../src/domain/cards/presence.js';
import { UserRole } from '../src/types.js';
import type { SSEMessage } from 'hono/streaming';
import { createTempTestData, cleanupTempTestData } from './test-utils.js';

let app: ReturnType<typeof createApp>;
let tempTestDataPath: string;
let commands: CommandManager;

beforeAll(async () => {
  process.argv = [];
  tempTestDataPath = await createTempTestData('decision-records');
  commands = await CommandManager.getInstance(tempTestDataPath);
  app = createApp(
    new MockAuthProvider(),
    ProjectRegistry.fromCommandManager(commands),
  );
});

afterAll(async () => {
  await cleanupTempTestData(tempTestDataPath);
});

/**
 * Parse SSE text into individual events.
 * Each event is separated by double newline, fields by single newline.
 */
function parseSSEEvents(
  text: string,
): Array<{ event?: string; data?: string }> {
  return text
    .split('\n\n')
    .filter((block) => block.trim())
    .map((block) => {
      const result: { event?: string; data?: string } = {};
      for (const line of block.split('\n')) {
        if (line.startsWith('event: ')) result.event = line.slice(7);
        else if (line.startsWith('data: ')) result.data = line.slice(6);
        else if (line.startsWith('data:')) result.data = line.slice(5);
      }
      return result;
    });
}

/**
 * Read from an SSE stream until the text contains `marker` or `maxChunks`
 * chunks have been read.
 */
async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  marker: string,
  maxChunks = 10,
): Promise<string> {
  const decoder = new TextDecoder();
  let text = '';
  for (let i = 0; i < maxChunks; i++) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    if (text.includes(marker)) break;
  }
  return text;
}

describe('GET /api/projects/:prefix/cards/:key/presence', () => {
  test('returns 200 with text/event-stream content type', async () => {
    const response = await app.request(
      '/api/projects/decision/cards/decision_5/presence?mode=viewing',
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
  });

  test('emits an initial presence event with the connected user', async () => {
    const response = await app.request(
      '/api/projects/decision/cards/decision_5/presence?mode=editing',
    );
    expect(response.status).toBe(200);

    // Read enough of the stream to get the initial presence event
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';

    // Read chunks until we have a complete presence event
    for (let i = 0; i < 10; i++) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (text.includes('data:') && text.includes('\n\n')) break;
    }
    void reader.cancel();

    const events = parseSSEEvents(text);
    const presenceEvent = events.find((e) => e.event === 'presence');
    expect(presenceEvent).toBeDefined();

    const data = JSON.parse(presenceEvent!.data!) as {
      editors: Array<{ userId: string; userName: string; mode: string }>;
    };
    expect(data.editors).toBeInstanceOf(Array);
    expect(data.editors.length).toBeGreaterThan(0);

    const mockUser = data.editors.find((e) => e.userId === 'mock-user');
    expect(mockUser).toBeDefined();
    expect(mockUser!.userName).toBe('Local Admin');
    expect(mockUser!.mode).toBe('editing');
  });

  test('defaults mode to viewing when not specified', async () => {
    const response = await app.request(
      '/api/projects/decision/cards/decision_5/presence',
    );
    expect(response.status).toBe(200);

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';

    for (let i = 0; i < 10; i++) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (text.includes('data:') && text.includes('\n\n')) break;
    }
    void reader.cancel();

    const events = parseSSEEvents(text);
    const presenceEvent = events.find((e) => e.event === 'presence');
    expect(presenceEvent).toBeDefined();

    const data = JSON.parse(presenceEvent!.data!) as {
      editors: Array<{ userId: string; mode: string }>;
    };
    const mockUser = data.editors.find((e) => e.userId === 'mock-user');
    expect(mockUser).toBeDefined();
    expect(mockUser!.mode).toBe('viewing');
  });

  test('broadcasts card-updated to viewers when another user saves', async () => {
    const stream = await app.request(
      '/api/projects/decision/cards/decision_5/presence',
    );
    expect(stream.status).toBe(200);
    const reader = stream.body!.getReader();
    // Consume the initial presence snapshot first.
    await readUntil(reader, 'event: presence');

    const patch = await app.request('/api/projects/decision/cards/decision_5', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        cookie: 'mock-user=bob',
      },
      body: JSON.stringify({ metadata: { title: 'Saved by Bob' } }),
    });
    expect(patch.status).toBe(200);

    const text = await readUntil(reader, 'event: card-updated');
    void reader.cancel();

    const updated = parseSSEEvents(text).find(
      (e) => e.event === 'card-updated',
    );
    expect(updated).toBeDefined();
    expect(JSON.parse(updated!.data!)).toEqual({
      cardKey: 'decision_5',
      userId: 'mock-user-bob',
      userName: 'Bob',
    });
  });

  test('a link write notifies viewers of both endpoint cards', async () => {
    // direction='inbound' on decision_5 stores the link in decision_6, and
    // both card pages render it.
    const streams = await Promise.all(
      ['decision_5', 'decision_6'].map((key) =>
        app.request(`/api/projects/decision/cards/${key}/presence`),
      ),
    );
    const readers = streams.map((stream) => stream.body!.getReader());
    for (const reader of readers) {
      await readUntil(reader, 'event: presence');
    }

    const post = await app.request(
      '/api/projects/decision/cards/decision_5/links',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'mock-user=bob',
        },
        body: JSON.stringify({
          toCard: 'decision_6',
          linkType: 'decision/linkTypes/test',
          direction: 'inbound',
        }),
      },
    );
    expect(post.status).toBe(200);

    const texts = await Promise.all(
      readers.map((reader) => readUntil(reader, 'event: card-updated')),
    );
    readers.forEach((reader) => void reader.cancel());

    const notified = texts.map(
      (text) =>
        JSON.parse(
          parseSSEEvents(text).find((e) => e.event === 'card-updated')!.data!,
        ).cardKey,
    );
    expect(notified).toEqual(['decision_5', 'decision_6']);
  });
});

describe('card-updated emission per write route', () => {
  const notify = vi.spyOn(presenceStore, 'notifyUpdated');
  const asBob = { cookie: 'mock-user=bob' };
  const json = (body: unknown) => ({
    headers: { 'content-type': 'application/json', ...asBob },
    body: JSON.stringify(body),
  });
  const notifiedKeys = () => notify.mock.calls.map(([key]) => key).sort();

  // The spy exists from file load, so drop calls made by earlier describes.
  beforeEach(() => {
    notify.mockClear();
  });

  afterAll(() => {
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
      'decision_5',
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

describe('PresenceStore unit tests', () => {
  afterEach(() => {
    presenceStore.removeAll();
  });

  test('add registers a connection and broadcasts', () => {
    const messages: SSEMessage[] = [];
    const connId = presenceStore.add(
      'test-card-1',
      {
        id: 'user-1',
        name: 'Alice',
        email: 'a@test.com',
        role: UserRole.Reader,
      },
      'viewing',
      (data) => messages.push(data),
    );

    expect(connId).toBeDefined();
    // Should have received a broadcast with the initial presence
    expect(messages.length).toBe(1);
    expect(messages[0].data as string).toContain('"userId":"user-1"');
    expect(messages[0].data as string).toContain('"mode":"viewing"');
  });

  test('remove cleans up connection and broadcasts to remaining', () => {
    const messages1: SSEMessage[] = [];
    const messages2: SSEMessage[] = [];

    const conn1 = presenceStore.add(
      'test-card-2',
      {
        id: 'user-1',
        name: 'Alice',
        email: 'a@test.com',
        role: UserRole.Reader,
      },
      'viewing',
      (data) => messages1.push(data),
    );
    presenceStore.add(
      'test-card-2',
      { id: 'user-2', name: 'Bob', email: 'b@test.com', role: UserRole.Reader },
      'editing',
      (data) => messages2.push(data),
    );

    // Both should have received broadcasts
    expect(messages1.length).toBeGreaterThan(0);
    expect(messages2.length).toBeGreaterThan(0);

    // Clear messages to track removal broadcast
    messages1.length = 0;
    messages2.length = 0;

    // Remove user-1
    presenceStore.remove('test-card-2', conn1);

    // user-2 should get an updated broadcast without user-1
    expect(messages2.length).toBe(1);
    const data = JSON.parse(messages2[0].data as string) as {
      editors: Array<{ userId: string }>;
    };
    expect(data.editors.length).toBe(1);
    expect(data.editors[0].userId).toBe('user-2');
  });

  test('getPresence deduplicates by user and prefers editing', () => {
    const noop = () => {};

    presenceStore.add(
      'test-card-3',
      {
        id: 'user-1',
        name: 'Alice',
        email: 'a@test.com',
        role: UserRole.Reader,
      },
      'viewing',
      noop,
    );
    presenceStore.add(
      'test-card-3',
      {
        id: 'user-1',
        name: 'Alice',
        email: 'a@test.com',
        role: UserRole.Reader,
      },
      'editing',
      noop,
    );

    const presence = presenceStore.getPresence('test-card-3');
    expect(presence.length).toBe(1);
    expect(presence[0].userId).toBe('user-1');
    expect(presence[0].mode).toBe('editing');
  });

  test('remove last connection deletes the card entry', () => {
    const conn = presenceStore.add(
      'test-card-5',
      {
        id: 'user-1',
        name: 'Alice',
        email: 'a@test.com',
        role: UserRole.Reader,
      },
      'viewing',
      () => {},
    );

    presenceStore.remove('test-card-5', conn);
    expect(presenceStore.getPresence('test-card-5')).toEqual([]);
  });

  test("notifyUpdated reaches only that card's connections and ignores unknown cards", () => {
    const onA: SSEMessage[] = [];
    const onB: SSEMessage[] = [];
    const viewer = {
      id: 'viewer',
      name: 'Viewer',
      email: 'v@test.com',
      role: UserRole.Reader,
    };
    presenceStore.add('card-a', viewer, 'viewing', (m) => onA.push(m));
    presenceStore.add('card-b', viewer, 'viewing', (m) => onB.push(m));
    onA.length = 0; // drop the presence broadcasts
    onB.length = 0;

    const writer = {
      id: 'writer',
      name: 'Writer',
      email: 'w@test.com',
      role: UserRole.Editor,
    };
    presenceStore.notifyUpdated('card-a', writer);
    presenceStore.notifyUpdated('nobody-here', writer);

    expect(onB).toHaveLength(0);
    expect(onA).toHaveLength(1);
    expect(onA[0].event).toBe('card-updated');
    expect(JSON.parse(onA[0].data as string)).toEqual({
      cardKey: 'card-a',
      userId: 'writer',
      userName: 'Writer',
    });
  });
});
