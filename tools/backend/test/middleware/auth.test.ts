import { describe, it, expect, vi } from 'vitest';
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
