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
import type { AuthProvider } from './types.js';

export interface MockUserConfig {
  name?: string;
  email?: string;
  roster?: boolean;
}

export const MOCK_ROLE_COOKIE = 'mock-role';
export const MOCK_USER_COOKIE = 'mock-user';

/** Id of the single local user when the roster is off, as in `cyberismo app`. */
export const LOCAL_USER_ID = 'mock-user';
const RESET_VALUE = 'default';

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
  parse: (value: string) => unknown,
): void {
  if (!override) return;
  if (override.toLowerCase() === RESET_VALUE) {
    setCookie(c, cookieName, '', { path: '/', maxAge: 0 });
  } else if (parse(override) != null) {
    setCookie(c, cookieName, override.toLowerCase(), {
      path: '/',
      sameSite: 'Lax',
    });
  }
}

export class MockAuthProvider implements AuthProvider {
  private readonly userConfig: MockUserConfig;

  constructor(config?: MockUserConfig) {
    this.userConfig = config ?? {};
  }

  async authenticate(req: Request): Promise<UserInfo> {
    const cookies = req.headers.get('cookie');
    const cookieRole = parseRole(readCookie(cookies, MOCK_ROLE_COOKIE));
    const rosterUser = this.userConfig.roster
      ? parseUser(readCookie(cookies, MOCK_USER_COOKIE))
      : null;
    if (rosterUser) {
      return { ...rosterUser, role: cookieRole ?? rosterUser.role };
    }

    return {
      id: LOCAL_USER_ID,
      email: this.userConfig.email ?? 'admin@cyberismo.local',
      name: this.userConfig.name ?? 'Local Admin',
      role: cookieRole ?? UserRole.Admin,
    };
  }

  /** Turns ?role= and, with the roster on, ?user= into cookies; "default" clears. */
  cookieMiddleware(): MiddlewareHandler {
    return async (c, next) => {
      const params = new URL(c.req.url).searchParams;
      applyOverride(c, params.get('role'), MOCK_ROLE_COOKIE, parseRole);
      if (this.userConfig.roster) {
        applyOverride(c, params.get('user'), MOCK_USER_COOKIE, parseUser);
      }
      await next();
    };
  }
}
