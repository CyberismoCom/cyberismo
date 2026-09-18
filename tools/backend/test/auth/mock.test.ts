import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import {
  MOCK_ROLE_COOKIE,
  MOCK_USER_COOKIE,
  MockAuthProvider,
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

  it('uses the connector role from cookie', async () => {
    const provider = new MockAuthProvider();
    const user = await provider.authenticate(
      new Request('http://localhost/api/test', {
        headers: { cookie: `${MOCK_ROLE_COOKIE}=connector` },
      }),
    );

    expect(user!.role).toBe(UserRole.Connector);
  });

  it('falls back to admin for an unrecognized cookie value', async () => {
    const provider = new MockAuthProvider();

    const unknown = await provider.authenticate(
      new Request('http://localhost/api/test', {
        headers: { cookie: `${MOCK_ROLE_COOKIE}=superuser` },
      }),
    );
    const prototypeKey = await provider.authenticate(
      new Request('http://localhost/api/test', {
        headers: { cookie: `${MOCK_ROLE_COOKIE}=constructor` },
      }),
    );

    expect(unknown!.role).toBe(UserRole.Admin);
    expect(prototypeKey!.role).toBe(UserRole.Admin);
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

  it('returns the roster identity for a case-insensitive mock-user cookie', async () => {
    const provider = new MockAuthProvider({ roster: true });
    const user = await provider.authenticate(
      new Request('http://localhost/api/test', {
        headers: { cookie: `${MOCK_USER_COOKIE}=CAROL` },
      }),
    );

    expect(user).toEqual({
      id: 'mock-user-carol',
      email: 'carol@example.com',
      name: 'Carol',
      role: UserRole.Reader,
    });
  });

  it('lets the mock-role cookie override the roster role', async () => {
    const provider = new MockAuthProvider({ roster: true });
    const user = await provider.authenticate(
      new Request('http://localhost/api/test', {
        headers: {
          cookie: `${MOCK_USER_COOKIE}=carol; ${MOCK_ROLE_COOKIE}=editor`,
        },
      }),
    );

    expect(user).toEqual({
      id: 'mock-user-carol',
      email: 'carol@example.com',
      name: 'Carol',
      role: UserRole.Editor,
    });
  });

  it('falls back to the default user for an unknown mock-user cookie', async () => {
    const provider = new MockAuthProvider({ roster: true });
    const defaultUser = {
      id: 'mock-user',
      email: 'admin@cyberismo.local',
      name: 'Local Admin',
      role: UserRole.Admin,
    };

    const unknown = await provider.authenticate(
      new Request('http://localhost/api/test', {
        headers: { cookie: `${MOCK_USER_COOKIE}=dave` },
      }),
    );
    const prototypeKey = await provider.authenticate(
      new Request('http://localhost/api/test', {
        headers: { cookie: `${MOCK_USER_COOKIE}=constructor` },
      }),
    );

    expect(unknown).toEqual(defaultUser);
    expect(prototypeKey).toEqual(defaultUser);
  });

  it('ignores the mock-user cookie when the roster is off', async () => {
    const provider = new MockAuthProvider();
    const user = await provider.authenticate(
      new Request('http://localhost/api/test', {
        headers: { cookie: `${MOCK_USER_COOKIE}=carol` },
      }),
    );

    expect(user).toEqual({
      id: 'mock-user',
      email: 'admin@cyberismo.local',
      name: 'Local Admin',
      role: UserRole.Admin,
    });
  });
});

describe('MockAuthProvider.cookieMiddleware', () => {
  function appWithMiddleware(roster = true) {
    const app = new Hono();
    app.use(new MockAuthProvider({ roster }).cookieMiddleware());
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

  it('ignores unknown user values', async () => {
    const app = appWithMiddleware();

    const unknown = await app.request('/?user=dave');
    const prototypeKey = await app.request('/?user=constructor');

    expect(unknown.headers.get('set-cookie')).toBeNull();
    expect(prototypeKey.headers.get('set-cookie')).toBeNull();
  });

  it('sets both cookies when role and user are in one request', async () => {
    const res = await appWithMiddleware().request('/?role=reader&user=bob');
    expect(res.headers.getSetCookie()).toEqual(
      expect.arrayContaining([
        expect.stringMatching(new RegExp(`^${MOCK_ROLE_COOKIE}=reader`)),
        expect.stringMatching(new RegExp(`^${MOCK_USER_COOKIE}=bob`)),
      ]),
    );
  });

  it('sets only the role cookie when the roster is off', async () => {
    const res = await appWithMiddleware(false).request(
      '/?role=reader&user=bob',
    );
    expect(res.headers.getSetCookie()).toEqual([
      expect.stringMatching(new RegExp(`^${MOCK_ROLE_COOKIE}=reader`)),
    ]);
  });
});
