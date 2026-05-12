import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import {
  attachCommandManager,
  attachProjectRegistry,
} from '../../src/middleware/commandManager.js';
import type { CommandManager } from '@cyberismo/data-handler';
import { UserRole } from '../../src/types.js';
import type { UserInfo } from '../../src/types.js';
import { ProjectRegistry } from '../../src/project-registry.js';

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
    const body = (await res.json()) as {
      hasCommands: boolean;
      projectPath: string;
    };
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

describe('attachProjectRegistry', () => {
  function createRegistry(entries: { prefix: string }[]) {
    return new ProjectRegistry(
      entries.map(({ prefix }) => ({
        prefix,
        commands: mockCommands({
          project: { basePath: `/tmp/${prefix}` },
        } as Partial<CommandManager>),
      })),
    );
  }

  function createApp(registry: ProjectRegistry, fixedPrefix?: string) {
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('user', testUser);
      await next();
    });
    app.use('/projects/:prefix/*', attachProjectRegistry(registry));
    app.get('/projects/:prefix/test', (c) =>
      c.json({
        projectPath: c.get('projectPath'),
        hasRegistry: !!c.get('registry'),
      }),
    );
    // Fixed prefix route (no :prefix param)
    app.use('/static/*', attachProjectRegistry(registry, fixedPrefix));
    app.get('/static/test', (c) => c.json({ ok: true }));
    return app;
  }

  it('resolves project by prefix and sets commands', async () => {
    const registry = createRegistry([{ prefix: 'decision' }]);
    const app = createApp(registry);

    const res = await app.request('/projects/decision/test');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      projectPath: string;
      hasRegistry: boolean;
    };
    expect(body.projectPath).toBe('/tmp/decision');
    expect(body.hasRegistry).toBe(true);
  });

  it('selects the correct project from multiple registered projects', async () => {
    const registry = createRegistry([
      { prefix: 'decision' },
      { prefix: 'other' },
    ]);
    const app = createApp(registry);

    const res = await app.request('/projects/other/test');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { projectPath: string };
    expect(body.projectPath).toBe('/tmp/other');
  });

  it('returns 404 for unknown prefix', async () => {
    const registry = createRegistry([{ prefix: 'decision' }]);
    const app = createApp(registry);

    const res = await app.request('/projects/unknown/test');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Project 'unknown' not found");
  });

  it('returns 400 when prefix is missing and no fixedPrefix', async () => {
    const registry = createRegistry([{ prefix: 'decision' }]);
    const app = createApp(registry);

    const res = await app.request('/static/test');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Project prefix is required');
  });

  it('uses fixedPrefix as fallback when no prefix param', async () => {
    const registry = createRegistry([{ prefix: 'decision' }]);
    const app = createApp(registry, 'decision');

    const res = await app.request('/static/test');
    expect(res.status).toBe(200);
  });

  it('returns 404 when fixedPrefix is not in registry', async () => {
    const registry = createRegistry([]);
    const app = createApp(registry, 'nonexistent');

    const res = await app.request('/static/test');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Project 'nonexistent' not found");
  });
});
