import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import {
  MOCK_EXP_COOKIE,
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
      exp: expect.any(Number),
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
      exp: expect.any(Number),
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
      exp: expect.any(Number),
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
      exp: expect.any(Number),
    });
  });

  it('falls back to the default user for an unknown mock-user cookie', async () => {
    const provider = new MockAuthProvider({ roster: true });
    const defaultUser = {
      id: 'mock-user',
      email: 'admin@cyberismo.local',
      name: 'Local Admin',
      role: UserRole.Admin,
      exp: expect.any(Number),
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
      exp: expect.any(Number),
    });
  });

  it('lets ?as= name a roster identity for one request', async () => {
    const provider = new MockAuthProvider({ roster: true });
    const user = await provider.authenticate(
      new Request('http://localhost/api/test?as=Bob'),
    );

    expect(user).toEqual({
      id: 'mock-user-bob',
      name: 'Bob',
      email: 'bob@example.com',
      role: UserRole.Editor,
      exp: expect.any(Number),
    });
  });

  it('gives ?as= precedence over both cookies', async () => {
    const provider = new MockAuthProvider({ roster: true });
    const user = await provider.authenticate(
      new Request('http://localhost/api/test?as=carol', {
        headers: {
          cookie: `${MOCK_USER_COOKIE}=alice; ${MOCK_ROLE_COOKIE}=admin`,
        },
      }),
    );

    expect(user).toEqual({
      id: 'mock-user-carol',
      name: 'Carol',
      email: 'carol@example.com',
      role: UserRole.Reader,
      exp: expect.any(Number),
    });
  });

  it('falls back to the cookie identity for an unknown ?as= value', async () => {
    const provider = new MockAuthProvider({ roster: true });
    const user = await provider.authenticate(
      new Request('http://localhost/api/test?as=mallory', {
        headers: { cookie: `${MOCK_USER_COOKIE}=alice` },
      }),
    );

    expect(user!.id).toBe('mock-user-alice');
  });

  it('ignores ?as= when the roster is off', async () => {
    const provider = new MockAuthProvider();
    const user = await provider.authenticate(
      new Request('http://localhost/api/test?as=bob'),
    );

    expect(user).toEqual({
      id: 'mock-user',
      email: 'admin@cyberismo.local',
      name: 'Local Admin',
      role: UserRole.Admin,
      exp: expect.any(Number),
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

  it('writes no cookie for ?as=, so the caller keeps its own identity', async () => {
    const res = await appWithMiddleware().request('/?as=bob');
    expect(res.headers.get('set-cookie')).toBeNull();
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

describe('MockAuthProvider expiry', () => {
  const future = () => Math.floor(Date.now() / 1000) + 90;
  const past = () => Math.floor(Date.now() / 1000) - 1;

  it('returns the deadline from the mock-exp cookie as the token expiry', async () => {
    const provider = new MockAuthProvider({ roster: true });
    const exp = future();
    const user = await provider.authenticate(
      new Request('http://localhost/api/test', {
        headers: {
          cookie: `${MOCK_USER_COOKIE}=bob; ${MOCK_EXP_COOKIE}=${exp}`,
        },
      }),
    );

    expect(user).toEqual({
      id: 'mock-user-bob',
      email: 'bob@example.com',
      name: 'Bob',
      role: UserRole.Editor,
      exp,
    });
  });

  it('expires the default user too, not just a roster identity', async () => {
    const provider = new MockAuthProvider({ roster: true });
    const exp = future();
    const user = await provider.authenticate(
      new Request('http://localhost/api/test', {
        headers: { cookie: `${MOCK_EXP_COOKIE}=${exp}` },
      }),
    );

    expect(user).toMatchObject({ id: 'mock-user', exp });
  });

  it('rejects the request once the deadline has passed', async () => {
    const provider = new MockAuthProvider({ roster: true });
    const user = await provider.authenticate(
      new Request('http://localhost/api/test', {
        headers: {
          cookie: `${MOCK_USER_COOKIE}=bob; ${MOCK_EXP_COOKIE}=${past()}`,
        },
      }),
    );

    expect(user).toBeNull();
  });

  it('ignores a malformed mock-exp cookie rather than locking the user out', async () => {
    const provider = new MockAuthProvider({ roster: true });
    const user = await provider.authenticate(
      new Request('http://localhost/api/test', {
        headers: { cookie: `${MOCK_EXP_COOKIE}=soon` },
      }),
    );

    expect(user).toMatchObject({ id: 'mock-user' });
    // Unreadable deadline is dropped, so the session falls back to the
    // inert far-future one rather than being locked out.
    expect(user!.exp).toBeGreaterThan(Math.floor(Date.now() / 1000) + 30 * 60);
  });

  it('ignores the mock-exp cookie when the roster is off', async () => {
    const provider = new MockAuthProvider();
    const user = await provider.authenticate(
      new Request('http://localhost/api/test', {
        headers: { cookie: `${MOCK_EXP_COOKIE}=${past()}` },
      }),
    );

    expect(user).toMatchObject({ id: 'mock-user' });
    expect(user!.exp).toBeGreaterThan(Math.floor(Date.now() / 1000) + 30 * 60);
  });
});

describe('MockAuthProvider expiry is always expressed', () => {
  it('reports a deadline far enough out to be inert when no ttl is set', async () => {
    const provider = new MockAuthProvider({ roster: true });
    const user = await provider.authenticate(
      new Request('http://localhost/api/test'),
    );

    const now = Math.floor(Date.now() / 1000);
    // Mock sessions do not expire; a distant deadline says so without making
    // `exp` optional for every consumer. It must clear the 30-minute stream
    // lifetime so rotation still falls to the jitter.
    expect(user!.exp).toBeGreaterThan(now + 30 * 60);
  });

  it('reports a deadline with the roster off too', async () => {
    const provider = new MockAuthProvider();
    const user = await provider.authenticate(
      new Request('http://localhost/api/test'),
    );

    expect(user!.exp).toBeGreaterThan(Math.floor(Date.now() / 1000) + 30 * 60);
  });
});

describe('MockAuthProvider.cookieMiddleware ttl', () => {
  function appWithMiddleware(roster = true) {
    const app = new Hono();
    app.use(new MockAuthProvider({ roster }).cookieMiddleware());
    app.get('*', (c) => c.text('ok'));
    return app;
  }

  it('turns ?ttl= seconds into an absolute deadline', async () => {
    const before = Math.floor(Date.now() / 1000);
    const res = await appWithMiddleware().request('/?ttl=90');
    const after = Math.floor(Date.now() / 1000);

    const match = new RegExp(`${MOCK_EXP_COOKIE}=(\\d+)`).exec(
      res.headers.get('set-cookie') ?? '',
    );
    expect(match).not.toBeNull();
    const exp = Number(match![1]);
    expect(exp).toBeGreaterThanOrEqual(before + 90);
    expect(exp).toBeLessThanOrEqual(after + 90);
  });

  it('clears the deadline when ttl=default', async () => {
    const res = await appWithMiddleware().request('/?ttl=default');
    const setCookie = res.headers.get('set-cookie') ?? '';

    expect(setCookie).toContain(`${MOCK_EXP_COOKIE}=`);
    expect(setCookie.toLowerCase()).toContain('max-age=0');
  });

  it.each(['0', '-5', 'soon', '1.5', '99999999999'])(
    'ignores the unusable ttl %s',
    async (ttl) => {
      const res = await appWithMiddleware().request(`/?ttl=${ttl}`);
      expect(res.headers.get('set-cookie')).toBeNull();
    },
  );

  it('ignores ?ttl= when the roster is off', async () => {
    const res = await appWithMiddleware(false).request('/?ttl=90');
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});
