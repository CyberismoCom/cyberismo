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

import type { MiddlewareHandler } from 'hono';
import { setCookie } from 'hono/cookie';
import { UserRole } from '../types.js';
import type { UserInfo } from '../types.js';
import type { AuthProvider } from './types.js';

export interface MockUserConfig {
  name?: string;
  email?: string;
}

export const MOCK_ROLE_COOKIE = 'mock-role';
const ROLE_RESET_VALUE = 'default';

const ROLE_ALIASES: Record<string, UserRole> = {
  reader: UserRole.Reader,
  editor: UserRole.Editor,
  admin: UserRole.Admin,
};

function parseRole(value: string | null | undefined): UserRole | null {
  if (!value) return null;
  return ROLE_ALIASES[value.toLowerCase()] ?? null;
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
    const cookieRole = parseRole(
      readCookie(req.headers.get('cookie'), MOCK_ROLE_COOKIE),
    );
    return {
      id: 'mock-user',
      email: this.userConfig.email ?? 'admin@cyberismo.local',
      name: this.userConfig.name ?? 'Local Admin',
      role: cookieRole ?? UserRole.Admin,
    };
  }
}

/**
 * Dev-only middleware that turns `?role=<reader|editor|admin>` into a persistent
 * `mock-role` cookie, and clears it on `?role=default`.
 */
export function mockRoleCookieMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const override = new URL(c.req.url).searchParams.get('role');
    if (override) {
      if (override.toLowerCase() === ROLE_RESET_VALUE) {
        setCookie(c, MOCK_ROLE_COOKIE, '', { path: '/', maxAge: 0 });
      } else if (parseRole(override)) {
        setCookie(c, MOCK_ROLE_COOKIE, override.toLowerCase(), {
          path: '/',
          sameSite: 'Lax',
        });
      }
    }
    await next();
  };
}
