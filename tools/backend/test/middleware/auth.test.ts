import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import {
  createAuthMiddleware,
  hasRole,
  requireRole,
  getCurrentUser,
} from '../../src/middleware/auth.js';
import { UserRole } from '../../src/types.js';
import type { UserInfo } from '../../src/types.js';
import type { AuthProvider } from '../../src/auth/types.js';
import { setPolicy } from '../../src/overlay.js';

const adminUser: UserInfo = {
  id: 'admin-1',
  email: 'admin@example.com',
  name: 'Admin',
  role: UserRole.Admin,
};

const readerUser: UserInfo = {
  id: 'reader-1',
  email: 'reader@example.com',
  name: 'Reader',
  role: UserRole.Reader,
};

const editorUser: UserInfo = {
  id: 'editor-1',
  email: 'editor@example.com',
  name: 'Editor',
  role: UserRole.Editor,
};

const connectorUser: UserInfo = {
  id: 'connector-1',
  email: 'connector@example.com',
  name: 'Connector',
  role: UserRole.Connector,
};

function mockProvider(user: UserInfo | null): AuthProvider {
  return { authenticate: vi.fn().mockResolvedValue(user) };
}

describe('createAuthMiddleware', () => {
  it('sets user on context when auth succeeds', async () => {
    const app = new Hono();
    app.use('*', createAuthMiddleware(mockProvider(adminUser)));
    app.get('/api/test', (c) => c.json(c.get('user')));

    const res = await app.request('/api/test');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(adminUser);
  });

  describe('read-only policy', () => {
    // The policy is module state, so each test starts from none.
    beforeEach(() => setPolicy({ readOnly: false, projects: {} }));

    function appFor(user: UserInfo) {
      const app = new Hono();
      app.use('*', createAuthMiddleware(mockProvider(user)));
      app.get('/api/test', (c) => c.json(c.get('user')));
      app.get('/api/projects/:prefix/cards', (c) => c.json(c.get('user')));
      return app;
    }

    it('lowers a non-admin role to reader when read-only', async () => {
      setPolicy({ readOnly: true, projects: {} });
      const res = await appFor(editorUser).request('/api/test');
      expect(await res.json()).toEqual({
        ...editorUser,
        role: UserRole.Reader,
      });
    });

    it('lowers a connector to reader when read-only', async () => {
      setPolicy({ readOnly: true, projects: {} });
      const res = await appFor(connectorUser).request('/api/test');
      expect(await res.json()).toEqual({
        ...connectorUser,
        role: UserRole.Reader,
      });
    });

    it('leaves an admin alone when read-only', async () => {
      setPolicy({ readOnly: true, projects: {} });
      const res = await appFor(adminUser).request('/api/test');
      expect(await res.json()).toEqual(adminUser);
    });

    it('leaves the role alone with no policy', async () => {
      const res = await appFor(editorUser).request('/api/test');
      expect(await res.json()).toEqual(editorUser);
    });

    it('applies a project freeze only to that project', async () => {
      setPolicy({ readOnly: false, projects: { frozen: { readOnly: true } } });
      const app = appFor(editorUser);

      const frozen = await app.request('/api/projects/frozen/cards');
      expect(await frozen.json()).toEqual({
        ...editorUser,
        role: UserRole.Reader,
      });

      const other = await app.request('/api/projects/other/cards');
      expect(await other.json()).toEqual(editorUser);

      // No project in the path, so a project freeze says nothing about it.
      const global = await app.request('/api/test');
      expect(await global.json()).toEqual(editorUser);
    });

    it('makes an editor fail an editor-gated route when read-only', async () => {
      const app = new Hono();
      app.use('*', createAuthMiddleware(mockProvider(editorUser)));
      app.post('/api/test', requireRole(UserRole.Editor), (c) =>
        c.json({ ok: true }),
      );

      const allowed = await app.request('/api/test', { method: 'POST' });
      expect(allowed.status).toBe(200);

      setPolicy({ readOnly: true, projects: {} });
      const denied = await app.request('/api/test', { method: 'POST' });
      expect(denied.status).toBe(403);
    });
  });

  it('returns 401 for unauthenticated /api/* requests', async () => {
    const app = new Hono();
    app.use('*', createAuthMiddleware(mockProvider(null)));
    app.get('/api/test', (c) => c.json({ ok: true }));

    const res = await app.request('/api/test');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });
});

describe('hasRole', () => {
  function appWithRole(user: UserInfo | null) {
    const app = new Hono();
    if (user) {
      app.use('*', async (c, next) => {
        c.set('user', user);
        await next();
      });
    }
    return app;
  }

  it('returns true for exact match', async () => {
    const app = appWithRole(readerUser);
    let result = false;
    app.get('/test', (c) => {
      result = hasRole(c, UserRole.Reader);
      return c.text('ok');
    });
    await app.request('/test');
    expect(result).toBe(true);
  });

  it('returns true for higher roles', async () => {
    const app = appWithRole(adminUser);
    let result = false;
    app.get('/test', (c) => {
      result = hasRole(c, UserRole.Editor);
      return c.text('ok');
    });
    await app.request('/test');
    expect(result).toBe(true);
  });

  it('returns false for lower roles', async () => {
    const app = appWithRole(readerUser);
    let result = true;
    app.get('/test', (c) => {
      result = hasRole(c, UserRole.Admin);
      return c.text('ok');
    });
    await app.request('/test');
    expect(result).toBe(false);
  });

  it('returns false when no user', async () => {
    const app = appWithRole(null);
    let result = true;
    app.get('/test', (c) => {
      result = hasRole(c, UserRole.Reader);
      return c.text('ok');
    });
    await app.request('/test');
    expect(result).toBe(false);
  });
});

describe('requireRole', () => {
  function appWithRequireRole(user: UserInfo | null, minimumRole: UserRole) {
    const app = new Hono();
    if (user) {
      app.use('*', async (c, next) => {
        c.set('user', user);
        await next();
      });
    }
    app.use('*', requireRole(minimumRole));
    app.get('/test', (c) => c.json({ ok: true }));
    return app;
  }

  it('returns 200 when role is sufficient', async () => {
    const app = appWithRequireRole(adminUser, UserRole.Editor);
    const res = await app.request('/test');
    expect(res.status).toBe(200);
  });

  it('returns 403 when role is insufficient', async () => {
    const app = appWithRequireRole(readerUser, UserRole.Admin);
    const res = await app.request('/test');
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('returns 401 when no user', async () => {
    const app = appWithRequireRole(null, UserRole.Reader);
    const res = await app.request('/test');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });
});

describe('requireRole with exactRoles', () => {
  function appWithExactRoles(
    user: UserInfo | null,
    minimumRole: UserRole,
    exactRoles: UserRole[],
  ) {
    const app = new Hono();
    if (user) {
      app.use('*', async (c, next) => {
        c.set('user', user);
        await next();
      });
    }
    app.use('*', requireRole(minimumRole, exactRoles));
    app.get('/test', (c) => c.json({ ok: true }));
    return app;
  }

  it('allows Connector when in exactRoles', async () => {
    const app = appWithExactRoles(connectorUser, UserRole.Admin, [
      UserRole.Connector,
    ]);
    const res = await app.request('/test');
    expect(res.status).toBe(200);
  });

  it('blocks Connector when not in exactRoles', async () => {
    const app = appWithExactRoles(connectorUser, UserRole.Admin, []);
    const res = await app.request('/test');
    expect(res.status).toBe(403);
  });

  it('Admin still passes via hierarchy', async () => {
    const app = appWithExactRoles(adminUser, UserRole.Admin, [
      UserRole.Connector,
    ]);
    const res = await app.request('/test');
    expect(res.status).toBe(200);
  });

  it('Editor blocked when minimum is Admin and not in exactRoles', async () => {
    const editorUser: UserInfo = {
      id: 'e1',
      email: 'e@e.com',
      name: 'Editor',
      role: UserRole.Editor,
    };
    const app = appWithExactRoles(editorUser, UserRole.Admin, [
      UserRole.Connector,
    ]);
    const res = await app.request('/test');
    expect(res.status).toBe(403);
  });

  it('Connector does not pass hierarchy check (hasRole returns false)', async () => {
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('user', connectorUser);
      await next();
    });
    let result = true;
    app.get('/test', (c) => {
      result = hasRole(c, UserRole.Reader);
      return c.text('ok');
    });
    await app.request('/test');
    expect(result).toBe(false);
  });
});

describe('getCurrentUser', () => {
  it('returns user from context', async () => {
    const app = new Hono();
    let result: UserInfo | null = null;
    app.use('*', async (c, next) => {
      c.set('user', adminUser);
      await next();
    });
    app.get('/test', (c) => {
      result = getCurrentUser(c);
      return c.text('ok');
    });
    await app.request('/test');
    expect(result).toEqual(adminUser);
  });

  it('returns null when no user', async () => {
    const app = new Hono();
    let result: UserInfo | null = adminUser;
    app.get('/test', (c) => {
      result = getCurrentUser(c);
      return c.text('ok');
    });
    await app.request('/test');
    expect(result).toBeNull();
  });
});
