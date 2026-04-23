import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import {
  MOCK_ROLE_COOKIE,
  MockAuthProvider,
  mockRoleCookieMiddleware,
} from '../../src/auth/mock.js';
import { UserRole } from '../../src/types.js';

describe('MockAuthProvider', () => {
  it('returns default admin user', async () => {
    const provider = new MockAuthProvider();
    const user = await provider.authenticate(
      new Request('http://localhost/api/test'),
    );

    expect(user).toEqual({
      id: 'mock-user',
      email: 'admin@cyberismo.local',
      name: 'Local Admin',
      role: UserRole.Admin,
    });
  });

  it('respects custom name and email config', async () => {
    const provider = new MockAuthProvider({
      name: 'Custom User',
      email: 'custom@example.com',
    });
    const user = await provider.authenticate(
      new Request('http://localhost/api/test'),
    );

    expect(user).toEqual({
      id: 'mock-user',
      email: 'custom@example.com',
      name: 'Custom User',
      role: UserRole.Admin,
    });
  });

  it('uses the role from the mock-role cookie when present', async () => {
    const provider = new MockAuthProvider();
    const user = await provider.authenticate(
      new Request('http://localhost/api/test', {
        headers: { cookie: `${MOCK_ROLE_COOKIE}=editor` },
      }),
    );

    expect(user!.role).toBe(UserRole.Editor);
  });

  it('falls back to admin for an unrecognized cookie value', async () => {
    const provider = new MockAuthProvider();
    const user = await provider.authenticate(
      new Request('http://localhost/api/test', {
        headers: { cookie: `${MOCK_ROLE_COOKIE}=superuser` },
      }),
    );

    expect(user!.role).toBe(UserRole.Admin);
  });

  it('is case-insensitive for the cookie value', async () => {
    const provider = new MockAuthProvider();
    const user = await provider.authenticate(
      new Request('http://localhost/api/test', {
        headers: { cookie: `${MOCK_ROLE_COOKIE}=READER` },
      }),
    );

    expect(user!.role).toBe(UserRole.Reader);
  });

  it('ignores unrelated cookies', async () => {
    const provider = new MockAuthProvider();
    const user = await provider.authenticate(
      new Request('http://localhost/api/test', {
        headers: { cookie: 'session=abc; other=editor' },
      }),
    );

    expect(user!.role).toBe(UserRole.Admin);
  });
});

describe('mockRoleCookieMiddleware', () => {
  function appWithMiddleware() {
    const app = new Hono();
    app.use(mockRoleCookieMiddleware());
    app.get('*', (c) => c.text('ok'));
    return app;
  }

  it('sets mock-role cookie when a known role is in the query', async () => {
    const res = await appWithMiddleware().request('/?role=editor');
    expect(res.headers.get('set-cookie')).toMatch(
      new RegExp(`^${MOCK_ROLE_COOKIE}=editor`),
    );
  });

  it('lowercases the cookie value', async () => {
    const res = await appWithMiddleware().request('/?role=ADMIN');
    expect(res.headers.get('set-cookie')).toMatch(
      new RegExp(`^${MOCK_ROLE_COOKIE}=admin`),
    );
  });

  it('clears the cookie when role=default', async () => {
    const res = await appWithMiddleware().request('/?role=default');
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${MOCK_ROLE_COOKIE}=`);
    expect(setCookie.toLowerCase()).toContain('max-age=0');
  });

  it('does nothing when there is no role query param', async () => {
    const res = await appWithMiddleware().request('/');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('ignores unknown role values', async () => {
    const res = await appWithMiddleware().request('/?role=superuser');
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});
