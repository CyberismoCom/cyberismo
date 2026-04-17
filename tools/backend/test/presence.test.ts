import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
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

beforeAll(async () => {
  process.argv = [];
  tempTestDataPath = await createTempTestData('decision-records');
  const commands = await CommandManager.getInstance(tempTestDataPath);
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
});
