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

import { Hono } from 'hono';
import { getCurrentUser } from '../../middleware/auth.js';

export function createAuthRouter() {
  const router = new Hono();

  /**
   * GET /api/auth/me
   * Returns the current user's information (id, email, name, role)
   */
  router.get('/me', async (c) => {
    const user = getCurrentUser(c);

    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    return c.json(user);
  });

  return router;
}
