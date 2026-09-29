/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import type { Context, MiddlewareHandler } from 'hono';
import { setCookie } from 'hono/cookie';
import { UserRole } from '../types.js';
import type { UserInfo } from '../types.js';
import type { AuthProvider, AuthResult } from './types.js';

export interface MockUserConfig {
  name?: string;
  email?: string;
  roster?: boolean;
}

export const MOCK_ROLE_COOKIE = 'mock-role';
export const MOCK_USER_COOKIE = 'mock-user';
export const MOCK_EXP_COOKIE = 'mock-exp';
export const MOCK_AS_PARAM = 'as';
const RESET_VALUE = 'default';
const MAX_TTL_SECONDS = 86_400;
// Mock sessions do not expire. Saying so with a distant deadline rather than
// no deadline keeps `exp` total for every consumer: it is far beyond the
// 30-minute stream lifetime, so computeLifetimeMs() min()s it away and
// rotation still falls to the jitter, exactly as an absent one did.
const NO_EXPIRY_SECONDS = 100 * 365 * 24 * 60 * 60;

function noExpiry(): number {
  return Math.floor(Date.now() / 1000) + NO_EXPIRY_SECONDS;
}

const ROLE_ALIASES = new Map<string, UserRole>([
  ['reader', UserRole.Reader],
  ['editor', UserRole.Editor],
  ['admin', UserRole.Admin],
  ['connector', UserRole.Connector],
]);

interface MockUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

// Opt-in: `cyberismo app` ships mock auth, where a roster identity would forge
// git commit authorship. Dev and e2e need several users in one backend process.
const MOCK_USERS = new Map<string, MockUser>([
  [
    'alice',
    {
      id: 'mock-user-alice',
      name: 'Alice',
      email: 'alice@example.com',
      role: UserRole.Admin,
    },
  ],
  [
    'bob',
    {
      id: 'mock-user-bob',
      name: 'Bob',
      email: 'bob@example.com',
      role: UserRole.Editor,
    },
  ],
  [
    'carol',
    {
      id: 'mock-user-carol',
      name: 'Carol',
      email: 'carol@example.com',
      role: UserRole.Reader,
    },
  ],
]);

function parseRole(value: string | null | undefined): UserRole | null {
  if (!value) return null;
  return ROLE_ALIASES.get(value.toLowerCase()) ?? null;
}

function parseUser(value: string | null | undefined): MockUser | null {
  if (!value) return null;
  return MOCK_USERS.get(value.toLowerCase()) ?? null;
}

/** An unreadable deadline is dropped rather than treated as long past, which
 * would lock the user out with no request left to clear the cookie. */
function parseExpiry(value: string | null | undefined): number | null {
  const exp = Number(value);
  return value && Number.isInteger(exp) && exp > 0 ? exp : null;
}

/** Seconds from now to the absolute epoch-second deadline to store. */
function toDeadline(value: string): string | null {
  const seconds = Number(value);
  if (!Number.isInteger(seconds) || seconds <= 0) return null;
  if (seconds > MAX_TTL_SECONDS) return null;
  return String(Math.floor(Date.now() / 1000) + seconds);
}

function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

function applyOverride(
  c: Context,
  override: string | null,
  cookieName: string,
  toCookieValue: (value: string) => string | null,
): void {
  if (!override) return;
  if (override.toLowerCase() === RESET_VALUE) {
    setCookie(c, cookieName, '', { path: '/', maxAge: 0 });
    return;
  }
  const value = toCookieValue(override);
  if (value === null) return;
  setCookie(c, cookieName, value, { path: '/', sameSite: 'Lax' });
}

export class MockAuthProvider implements AuthProvider {
  private readonly userConfig: MockUserConfig;

  constructor(config?: MockUserConfig) {
    this.userConfig = config ?? {};
  }

  async authenticate(req: Request): Promise<AuthResult | null> {
    const cookies = req.headers.get('cookie');
    const cookieRole = parseRole(readCookie(cookies, MOCK_ROLE_COOKIE));
    if (this.userConfig.roster) {
      // One-shot: a second identity from inside a tab already signed in as
      // someone else, so neither the cookie nor the role override applies.
      const asUser = parseUser(
        new URL(req.url).searchParams.get(MOCK_AS_PARAM),
      );
      if (asUser) return { ...asUser, exp: noExpiry() };
    }
    const rosterUser = this.userConfig.roster
      ? parseUser(readCookie(cookies, MOCK_USER_COOKIE))
      : null;
    const expiry = this.userConfig.roster
      ? parseExpiry(readCookie(cookies, MOCK_EXP_COOKIE))
      : null;
    if (expiry !== null && expiry * 1000 <= Date.now()) return null;
    const exp = expiry ?? noExpiry();

    const identity: UserInfo = rosterUser ?? {
      id: 'mock-user',
      email: this.userConfig.email ?? 'admin@cyberismo.local',
      name: this.userConfig.name ?? 'Local Admin',
      role: UserRole.Admin,
    };
    return { ...identity, role: cookieRole ?? identity.role, exp };
  }

  /**
   * Turns ?role= and, with the roster on, ?user= and ?ttl= into cookies;
   * "default" clears. ?ttl= seconds gives the session an expiry, which is
   * what drives stream rotation and the 401 that follows it.
   */
  cookieMiddleware(): MiddlewareHandler {
    return async (c, next) => {
      const params = new URL(c.req.url).searchParams;
      applyOverride(c, params.get('role'), MOCK_ROLE_COOKIE, (value) =>
        parseRole(value) ? value.toLowerCase() : null,
      );
      if (this.userConfig.roster) {
        applyOverride(c, params.get('user'), MOCK_USER_COOKIE, (value) =>
          parseUser(value) ? value.toLowerCase() : null,
        );
        applyOverride(c, params.get('ttl'), MOCK_EXP_COOKIE, toDeadline);
      }
      await next();
    };
  }
}
