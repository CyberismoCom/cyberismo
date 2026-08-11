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
import { UserRole } from '../types.js';

/**
 * Downgrades editors to readers while a project is in read-only mode.
 *
 * Enforcement happens here rather than route by route: every project-scoped
 * route already gates on `requireRole`, which reads the user off the context,
 * so capping the role in one place closes all of them at once.
 *
 * Two roles are deliberately left alone:
 * - Admin, so whoever enabled the mode can still turn it off, and so
 *   maintenance work stays possible. Admins are told the mode is on by the
 *   banner rather than by being locked out.
 * - Connector, a service account outside the reader/editor/admin hierarchy
 *   that route guards admit via an exact-role match. Capping it would silently
 *   break calculation sync, so it is left for a later iteration.
 */
export function readOnlyMode(): MiddlewareHandler {
  return async (c, next) => {
    const user = c.get('user');
    const registry = c.get('registry');
    const prefix = c.get('projectPrefix');

    if (user?.role === UserRole.Editor && registry?.isReadOnly(prefix)) {
      c.set('user', { ...user, role: UserRole.Reader });
    }

    await next();
  };
}
