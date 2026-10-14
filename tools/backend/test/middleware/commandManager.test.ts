import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { ActorRef } from '@cyberismo/model';
import {
  ProjectNotFoundError,
  type CommitIdentity,
  type ProjectDirectory,
  type Workspace,
} from '@cyberismo/data-handler';
import { attachProjectDirectory } from '../../src/middleware/commandManager.js';
import { errorResponse } from '../../src/common/errors.js';
import { EventsByProject } from '../../src/domain/events/events-by-project.js';
import { UserRole } from '../../src/types.js';
import type { UserInfo } from '../../src/types.js';

const testUser: UserInfo = {
  id: 'user-1',
  email: 'alice@example.com',
  name: 'Alice',
  role: UserRole.Editor,
};

// A directory whose handles carry what open was given.
function fakeDirectory(prefixes: string[]): ProjectDirectory {
  const changes = { subscribe: () => () => {} };
  return {
    open: async (
      prefix: string,
      actor: ActorRef,
      identity?: CommitIdentity,
    ) => {
      if (!prefixes.includes(prefix)) {
        throw new ProjectNotFoundError(prefix);
      }
      return { path: `/tmp/${prefix}`, actor, identity, changes };
    },
  } as unknown as ProjectDirectory;
}

interface ContextBody {
  projectPath: string;
  actor: unknown;
  identity: unknown;
  hasEvents: boolean;
}

// An app that exposes what the middleware put on the context.
function createApp(
  directory: ProjectDirectory,
  {
    user = testUser,
    fixedPrefix,
  }: { user?: UserInfo | null; fixedPrefix?: string } = {},
) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    if (user) c.set('user', user);
    await next();
  });
  const events = new EventsByProject(directory);
  const body = (ws: Workspace, hasEvents: boolean): ContextBody => ({
    projectPath: ws.path,
    actor: ws.actor,
    identity: ws.identity,
    hasEvents,
  });
  app.use('/projects/:prefix/*', attachProjectDirectory(directory, events));
  app.get('/projects/:prefix/test', (c) =>
    c.json(body(c.get('ws'), !!c.get('events'))),
  );
  // Fixed prefix route (no :prefix param)
  app.use('/static/*', attachProjectDirectory(directory, events, fixedPrefix));
  app.get('/static/test', (c) => c.json({ ok: true }));
  app.onError((error, c) => {
    const { status, body } = errorResponse(error);
    return c.json(body, status);
  });
  return app;
}

describe('attachProjectDirectory', () => {
  it('opens the project by prefix and sets the handle, its path and events', async () => {
    const app = createApp(fakeDirectory(['decision']));

    const res = await app.request('/projects/decision/test');
    expect(res.status).toBe(200);
    const body = (await res.json()) as ContextBody;
    expect(body.projectPath).toBe('/tmp/decision');
    expect(body.hasEvents).toBe(true);
  });

  it('selects the correct project from multiple projects', async () => {
    const app = createApp(fakeDirectory(['decision', 'other']));

    const res = await app.request('/projects/other/test');
    expect(res.status).toBe(200);
    const body = (await res.json()) as ContextBody;
    expect(body.projectPath).toBe('/tmp/other');
  });

  it('acts as the authenticated user', async () => {
    const res = await createApp(fakeDirectory(['decision'])).request(
      '/projects/decision/test',
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as ContextBody;
    expect(body.actor).toEqual({
      kind: 'user',
      id: testUser.id,
      name: testUser.name,
    });
    expect(body.identity).toEqual({
      name: testUser.name,
      email: testUser.email,
    });
  });

  it('records a connector account as a connector actor', async () => {
    const res = await createApp(fakeDirectory(['decision']), {
      user: { ...testUser, role: UserRole.Connector },
    }).request('/projects/decision/test');
    expect(res.status).toBe(200);
    expect(((await res.json()) as ContextBody).actor).toEqual({
      kind: 'connector',
      id: testUser.id,
      name: testUser.name,
    });
  });

  it('throws when no user is present', async () => {
    const res = await createApp(fakeDirectory(['decision']), {
      user: null,
    }).request('/projects/decision/test');
    expect(res.status).toBe(500);
  });

  it('returns 404 for unknown prefix', async () => {
    const app = createApp(fakeDirectory(['decision']));

    const res = await app.request('/projects/unknown/test');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: "Project 'unknown' not found",
      code: 'not-found',
      message: "Project 'unknown' not found",
      details: { prefix: 'unknown' },
    });
  });

  it('returns 400 when prefix is missing and no fixedPrefix', async () => {
    const app = createApp(fakeDirectory(['decision']));

    const res = await app.request('/static/test');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Project prefix is required');
  });

  it('uses fixedPrefix as fallback when no prefix param', async () => {
    const app = createApp(fakeDirectory(['decision']), {
      fixedPrefix: 'decision',
    });

    const res = await app.request('/static/test');
    expect(res.status).toBe(200);
  });

  it('returns 404 when fixedPrefix is not in the directory', async () => {
    const app = createApp(fakeDirectory([]), { fixedPrefix: 'nonexistent' });

    const res = await app.request('/static/test');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Project 'nonexistent' not found");
  });
});
