/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import type { Context, MiddlewareHandler } from 'hono';
import type { UserInfo } from '../types.js';
import { UserRole } from '../types.js';
import type { AuthProvider } from '../auth/types.js';

// Extend Hono Context type to include our custom properties
declare module 'hono' {
  interface ContextVariableMap {
    user: UserInfo;
  }
}

const roleLevel: Record<UserRole, number> = {
  [UserRole.Reader]: 0,
  [UserRole.Editor]: 1,
  [UserRole.Admin]: 2,
};

/**
 * Create authentication middleware from an AuthProvider.
 * Validates the user and attaches user info to the context.
 */
export function createAuthMiddleware(
  provider: AuthProvider,
): MiddlewareHandler {
  return async (c, next) => {
    const user = await provider.authenticate(c.req.raw);

    if (user) {
      c.set('user', user);
    } else {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    await next();
  };
}

/**
 * Check if the current user has at least the required role
 */
export function hasRole(c: Context, minimumRole: UserRole): boolean {
  const user = c.get('user');
  if (!user) {
    return false;
  }

  return roleLevel[user.role] >= roleLevel[minimumRole];
}

/**
 * Require minimum role middleware factory
 * Returns a middleware that checks if the user has at least the required role
 */
export function requireRole(minimumRole: UserRole): MiddlewareHandler {
  return async (c, next) => {
    const user = c.get('user');

    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    if (!hasRole(c, minimumRole)) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    await next();
  };
}

/**
 * Get current user from context
 * Returns null if not authenticated
 */
export function getCurrentUser(c: Context): UserInfo | null {
  return c.get('user') || null;
}
