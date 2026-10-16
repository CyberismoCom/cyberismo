// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

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
