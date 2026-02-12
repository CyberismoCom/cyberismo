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
import type { UserInfo, Permission } from '../types.js';
import type { AuthProvider } from '../auth/types.js';

// Extend Hono Context type to include our custom properties
declare module 'hono' {
  interface ContextVariableMap {
    user: UserInfo;
  }
}

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
    } else if (c.req.path.startsWith('/api/')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    await next();
  };
}

/**
 * Check if the current user has the required permission
 */
export function hasPermission(c: Context, permission: Permission): boolean {
  const user = c.get('user');
  if (!user) {
    return false;
  }

  return user.permissions.includes(permission);
}

/**
 * Check if the current user has any of the required permissions
 */
export function hasAnyPermission(
  c: Context,
  permissions: Permission[],
): boolean {
  const user = c.get('user');
  if (!user) {
    return false;
  }

  return permissions.some((perm) => user.permissions.includes(perm));
}

/**
 * Require specific permission middleware factory
 * Returns a middleware that checks if the user has the required permission
 */
export function requirePermission(permission: Permission): MiddlewareHandler {
  return async (c, next) => {
    const user = c.get('user');

    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    if (!hasPermission(c, permission)) {
      return c.json(
        { error: `Forbidden: ${permission} permission required` },
        403,
      );
    }

    await next();
  };
}

/**
 * Require any of the specified permissions middleware factory
 */
export function requireAnyPermission(
  permissions: Permission[],
): MiddlewareHandler {
  return async (c, next) => {
    const user = c.get('user');

    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    if (!hasAnyPermission(c, permissions)) {
      return c.json(
        {
          error: `Forbidden: One of [${permissions.join(', ')}] permissions required`,
        },
        403,
      );
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

/**
 * Get user permissions from context
 * Returns empty array if not authenticated
 */
export function getUserPermissions(c: Context): Permission[] {
  const user = c.get('user');
  return user?.permissions || [];
}
