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
}

export const MOCK_ROLE_COOKIE = 'mock-role';
export const MOCK_USER_COOKIE = 'mock-user';
const RESET_VALUE = 'default';

const ROLE_ALIASES: Record<string, UserRole> = {
  reader: UserRole.Reader,
  editor: UserRole.Editor,
  admin: UserRole.Admin,
  connector: UserRole.Connector,
};

interface MockUser {
  name: string;
  email: string;
  role: UserRole;
}

/**
 * Dev-only roster of distinct identities. Features that compare users against
 * each other — card presence, most obviously — need two identities in one
 * backend process, which the single default user cannot provide.
 *
 * Carol is a Reader on purpose: `usePresence` gates on the Editor role, so she
 * never opens the presence stream. Use alice or bob to exercise presence.
 */
const MOCK_USERS: Record<string, MockUser> = {
  alice: { name: 'Alice', email: 'alice@example.com', role: UserRole.Admin },
  bob: { name: 'Bob', email: 'bob@example.com', role: UserRole.Editor },
  carol: { name: 'Carol', email: 'carol@example.com', role: UserRole.Reader },
};

function parseRole(value: string | null | undefined): UserRole | null {
  if (!value) return null;
  return ROLE_ALIASES[value.toLowerCase()] ?? null;
}

function parseUser(value: string | null | undefined): MockUser | null {
  if (!value) return null;
  return MOCK_USERS[value.toLowerCase()] ?? null;
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

export class MockAuthProvider implements AuthProvider {
  private readonly userConfig: MockUserConfig;

  constructor(config?: MockUserConfig) {
    this.userConfig = config ?? {};
  }

  async authenticate(req: Request): Promise<UserInfo> {
    const cookies = req.headers.get('cookie');
    const cookieRole = parseRole(readCookie(cookies, MOCK_ROLE_COOKIE));
    const rosterKey = readCookie(cookies, MOCK_USER_COOKIE)?.toLowerCase();
    const rosterUser = parseUser(rosterKey);

    if (rosterUser) {
      return {
        id: `mock-user-${rosterKey}`,
        email: rosterUser.email,
        name: rosterUser.name,
        role: cookieRole ?? rosterUser.role,
      };
    }

    return {
      id: 'mock-user',
      email: this.userConfig.email ?? 'admin@cyberismo.local',
      name: this.userConfig.name ?? 'Local Admin',
      role: cookieRole ?? UserRole.Admin,
    };
  }
}

/**
 * Applies one `?<param>=<value>` override to a persistent cookie.
 * `default` clears it; an unrecognized value is ignored.
 */
function applyOverride(
  c: Context,
  raw: string | null,
  cookieName: string,
  isKnown: (value: string) => boolean,
): void {
  if (!raw) return;
  if (raw.toLowerCase() === RESET_VALUE) {
    setCookie(c, cookieName, '', { path: '/', maxAge: 0 });
  } else if (isKnown(raw)) {
    setCookie(c, cookieName, raw.toLowerCase(), {
      path: '/',
      sameSite: 'Lax',
    });
  }
}

/**
 * Dev-only middleware that turns `?role=<reader|editor|admin>` and
 * `?user=<alice|bob|carol>` into persistent cookies, and clears either on
 * `?role=default` / `?user=default`. Lets roles and identities be switched
 * locally without code changes or a restart.
 */
export function mockIdentityCookieMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const params = new URL(c.req.url).searchParams;
    applyOverride(c, params.get('role'), MOCK_ROLE_COOKIE, (v) =>
      Boolean(parseRole(v)),
    );
    applyOverride(c, params.get('user'), MOCK_USER_COOKIE, (v) =>
      Boolean(parseUser(v)),
    );
    await next();
  };
}
