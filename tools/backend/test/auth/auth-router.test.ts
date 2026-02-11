import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { createAuthRouter } from '../../src/domain/auth/index.js';
import { createAuthMiddleware } from '../../src/middleware/auth.js';
import { MockAuthProvider } from '../../src/auth/mock.js';
import { UserRole } from '../../src/types.js';
import type { UserInfo } from '../../src/types.js';
import type { AuthProvider } from '../../src/auth/types.js';

function createTestApp(provider: AuthProvider) {
  const app = new Hono();
  app.use('/api/*', createAuthMiddleware(provider));
  app.route('/api/auth', createAuthRouter());
  return app;
}

describe('/api/auth/me', () => {
  it('returns user JSON when authenticated', async () => {
    const user: UserInfo = {
      id: 'test-user',
      email: 'test@example.com',
      name: 'Test User',
      role: UserRole.Editor,
    };
    const provider: AuthProvider = {
      authenticate: vi.fn().mockResolvedValue(user),
    };

    const app = createTestApp(provider);
    const res = await app.request('/api/auth/me');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(user);
  });

  it('returns 401 when not authenticated', async () => {
    const provider: AuthProvider = {
      authenticate: vi.fn().mockResolvedValue(null),
    };

    const app = createTestApp(provider);
    const res = await app.request('/api/auth/me');

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('works end-to-end with MockAuthProvider', async () => {
    const app = createTestApp(new MockAuthProvider());
    const res = await app.request('/api/auth/me');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      id: 'mock-user',
      email: 'admin@cyberismo.local',
      name: 'Local Admin',
      role: UserRole.Admin,
    });
  });
});
