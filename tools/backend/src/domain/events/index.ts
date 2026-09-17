/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { Hono } from 'hono';
import { disableSSG } from 'hono/ssg';
import { streamSSE, type SSEMessage } from 'hono/streaming';
import { isAtLeastRole, requireRole } from '../../middleware/auth.js';
import { zValidator } from '../../middleware/zvalidator.js';
import { UserRole } from '../../types.js';
import { computeLifetimeMs } from './lifetime.js';
import { presenceSchema } from './schema.js';

const HEARTBEAT_INTERVAL_MS = 30_000;

/** Contract: tools/backend/README.md, "Project events". */
const router = new Hono();

router.get('/', disableSSG(), requireRole(UserRole.Reader), (c) => {
  const events = c.get('events');
  const user = c.get('user');
  const capabilities = {
    canSeeIdentity: isAtLeastRole(user.role, UserRole.Editor),
    canDeclareEditing: isAtLeastRole(user.role, UserRole.Editor),
  };
  return streamSSE(c, async (stream) => {
    if (stream.aborted) return;
    let finish: () => void = () => {};
    const closed = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let stopped = false;
    let release = () => {};
    const stop = () => {
      if (stopped) return;
      stopped = true;
      release();
      finish();
    };
    const terminate = (message: SSEMessage) => {
      if (stopped) return;
      stopped = true;
      void stream.writeSSE(message).then(finish);
    };
    // Hono swallows stream write errors; `onAbort` is the only teardown signal.
    stream.onAbort(stop);
    const connectionId = events.connect(
      user,
      capabilities,
      (message) => void stream.writeSSE(message),
      stop,
      terminate,
    );
    release = () => events.disconnect(connectionId);
    const heartbeat = setInterval(
      () => void stream.writeSSE({ event: 'hb', data: '' }),
      HEARTBEAT_INTERVAL_MS,
    );
    const rotate = setTimeout(
      () => {
        if (stopped) return;
        events.retire(connectionId);
        terminate({ event: 'rotating', data: '' });
      },
      computeLifetimeMs(c.get('tokenExp')),
    );
    try {
      await closed;
    } finally {
      clearInterval(heartbeat);
      clearTimeout(rotate);
      stop();
    }
  });
});

router.put(
  '/presence',
  requireRole(UserRole.Reader),
  zValidator('json', presenceSchema),
  (c) => {
    const { connectionId, sequence, cardKey, mode } = c.req.valid('json');
    if (cardKey && !c.get('commands').project.hasCard(cardKey)) {
      return c.json({ error: 'Card not found' }, 404);
    }
    const events = c.get('events');
    const known = events.update(
      connectionId,
      c.get('user').id,
      sequence,
      cardKey,
      mode,
    );
    if (!known) {
      return c.json({ error: 'Presence connection not found' }, 404);
    }
    return c.body(null, 204);
  },
);

export default router;
