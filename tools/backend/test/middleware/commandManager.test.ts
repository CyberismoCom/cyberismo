import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { attachCommandManager } from '../../src/middleware/commandManager.js';
import type { CommandManager } from '@cyberismo/data-handler';
import { UserRole } from '../../src/types.js';
import type { UserInfo } from '../../src/types.js';

const testUser: UserInfo = {
  id: 'user-1',
  email: 'alice@example.com',
  name: 'Alice',
  role: UserRole.Editor,
};

function mockCommands(overrides?: Partial<CommandManager>) {
  return {
    project: { basePath: '/tmp/test-project' },
    runAsAuthor: vi.fn((_author, fn) => fn()),
    ...overrides,
  } as unknown as CommandManager;
}

describe('attachCommandManager', () => {
  it('sets commands and projectPath on context', async () => {
    const commands = mockCommands();
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('user', testUser);
      await next();
    });
    app.use('*', attachCommandManager(commands));
    app.get('/test', (c) =>
      c.json({
        hasCommands: c.get('commands') === commands,
        projectPath: c.get('projectPath'),
      }),
    );

    const res = await app.request('/test');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasCommands).toBe(true);
    expect(body.projectPath).toBe('/tmp/test-project');
  });

  it('wraps next() with runAsAuthor when user is present', async () => {
    const commands = mockCommands();
    const app = new Hono();

    // Simulate auth middleware setting user
    app.use('*', async (c, next) => {
      c.set('user', testUser);
      await next();
    });
    app.use('*', attachCommandManager(commands));
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test');
    expect(res.status).toBe(200);
    expect(commands.runAsAuthor).toHaveBeenCalledOnce();
    expect(commands.runAsAuthor).toHaveBeenCalledWith(
      { name: testUser.name, email: testUser.email },
      expect.any(Function),
    );
  });

  it('throws when no user is present', async () => {
    const commands = mockCommands();
    const app = new Hono();
    app.use('*', attachCommandManager(commands));
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test');
    expect(res.status).toBe(500);
    expect(commands.runAsAuthor).not.toHaveBeenCalled();
  });
});
