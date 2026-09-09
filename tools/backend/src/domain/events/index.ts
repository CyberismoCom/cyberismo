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
import { streamSSE } from 'hono/streaming';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireRole } from '../../middleware/auth.js';
import { UserRole } from '../../types.js';

const router = new Hono();

router.get('/events', requireRole(UserRole.Reader), (c) => {
  const events = c.get('registry').eventsFor(c.get('commands'));
  return streamSSE(c, async (stream) => {
    let stopped = false;
    let finish: () => void = () => {};
    const done = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let disconnect = () => {};
    const stop = () => {
      if (stopped) return;
      stopped = true;
      disconnect();
      finish();
    };
    stream.onAbort(stop);
    if (stream.aborted) return;
    const connectionId = events.connect(
      c.get('user'),
      (message) => {
        void stream.writeSSE(message).catch(stop);
      },
      stop,
    );
    disconnect = () => events.disconnect(connectionId);
    if (stopped) disconnect();
    const heartbeat = setInterval(() => {
      void stream.write(': hb\n\n').catch(stop);
    }, 30_000);
    try {
      await done;
    } finally {
      clearInterval(heartbeat);
      stop();
    }
  });
});

router.put(
  '/presence',
  requireRole(UserRole.Reader),
  zValidator(
    'json',
    z.object({
      connectionId: z.string().uuid(),
      sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      cardKey: z.string().min(1).nullable(),
      mode: z.enum(['viewing', 'editing']),
    }),
  ),
  (c) => {
    if (process.env.APP_PRESENCE_ENABLED !== 'true') return c.body(null, 204);
    const { connectionId, sequence, cardKey, mode } = c.req.valid('json');
    if (cardKey) {
      try {
        c.get('commands').project.findCard(cardKey);
      } catch {
        return c.json({ error: 'Card not found' }, 404);
      }
    }
    const events = c.get('registry').eventsFor(c.get('commands'));
    if (
      !events.update(connectionId, c.get('user').id, sequence, cardKey, mode)
    ) {
      return c.json({ error: 'Presence connection not found' }, 404);
    }
    return c.body(null, 204);
  },
);

export default router;
