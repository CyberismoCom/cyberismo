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

import { Hono, type Context } from 'hono';
import { disableSSG } from 'hono/ssg';
import {
  CardUnchangedError,
  ChangeSetBehindError,
  ChangeSetClosedError,
  ChangeSetError,
  ChangeSetInvalidError,
  ChangeSetNotFoundError,
} from '@cyberismo/data-handler';
import { requireRole } from '../../middleware/auth.js';
import { zValidator } from '../../middleware/zvalidator.js';
import { UserRole } from '../../types.js';
import {
  activeChangeSetSchema,
  createChangeSetSchema,
  reviewedSchema,
  updateChangeSetSchema,
} from './schema.js';

/**
 * Manages a project's changeSets. The cards inside a changeSet are served
 * by the project routes mounted under /changesets/:changeSetId (app.ts).
 * Contract: tools/backend/README.md, "Changesets".
 */
const router = new Hono();
router.use('*', disableSSG());

const changeSets = (c: Context) =>
  c.get('registry').changeSetsFor(c.get('commands'));

// Tells the project's viewers a changeSet changed, and those working in it:
// they watch the changeSet's own stream.
function announce(c: Context, id: string, action: string) {
  c.get('registry').announceChangeSet(
    c.get('commands'),
    id,
    action,
    c.get('user'),
  );
}

// Maps changeSet errors to responses; anything else is a server error.
function failure(c: Context, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof ChangeSetNotFoundError) {
    return c.json({ error: message }, 404);
  }
  if (
    error instanceof ChangeSetClosedError ||
    error instanceof ChangeSetBehindError
  ) {
    return c.json({ error: message }, 409);
  }
  if (error instanceof ChangeSetInvalidError) {
    return c.json({ error: message, errors: error.errors }, 422);
  }
  if (error instanceof CardUnchangedError) {
    return c.json({ error: message }, 404);
  }
  if (error instanceof ChangeSetError) {
    return c.json({ error: message }, 422);
  }
  // Internal failures stay in the server log: they may name files and paths
  console.error(error);
  return c.json({ error: 'Changeset operation failed' }, 500);
}

router.get('/', requireRole(UserRole.Reader), async (c) => {
  const active = await changeSets(c).getActive(c.get('user').id);
  const infos = await changeSets(c).list();
  return c.json(
    infos.map((info) => ({ ...info, active: info.id === active?.id })),
  );
});

router.post(
  '/',
  requireRole(UserRole.Editor),
  zValidator('json', createChangeSetSchema),
  async (c) => {
    const { title, activate = true } = c.req.valid('json');
    try {
      const info = await changeSets(c).create(title);
      if (activate) {
        await changeSets(c).setActive(c.get('user').id, info.id);
      }
      announce(c, info.id, 'created');
      return c.json({ ...info, active: activate }, 201);
    } catch (error) {
      return failure(c, error);
    }
  },
);

// The current user's active changeSet: where their changes, and their
// agents', go instead of the project. Registered before '/:id'.
router.get('/active', requireRole(UserRole.Reader), async (c) => {
  const active = await changeSets(c).getActive(c.get('user').id);
  return c.json({ changeSet: active ?? null });
});

router.put(
  '/active',
  requireRole(UserRole.Editor),
  zValidator('json', activeChangeSetSchema),
  async (c) => {
    const { id } = c.req.valid('json');
    try {
      await changeSets(c).setActive(c.get('user').id, id);
      const active = await changeSets(c).getActive(c.get('user').id);
      // The user's other tabs and sessions follow
      announce(c, id ?? '', 'activated');
      return c.json({ changeSet: active ?? null });
    } catch (error) {
      return failure(c, error);
    }
  },
);

router.get('/:id', requireRole(UserRole.Reader), async (c) => {
  try {
    return c.json(await changeSets(c).get(c.req.param('id')));
  } catch (error) {
    return failure(c, error);
  }
});

router.delete('/:id', requireRole(UserRole.Editor), async (c) => {
  const id = c.req.param('id');
  try {
    await changeSets(c).discard(id);
    announce(c, id, 'discarded');
    return c.json(await changeSets(c).get(id));
  } catch (error) {
    return failure(c, error);
  }
});

router.get('/:id/changes', requireRole(UserRole.Reader), async (c) => {
  try {
    return c.json(await changeSets(c).changes(c.req.param('id')));
  } catch (error) {
    return failure(c, error);
  }
});

router.get('/:id/changes/:key', requireRole(UserRole.Reader), async (c) => {
  try {
    return c.json(
      await changeSets(c).cardDiff(c.req.param('id'), c.req.param('key')),
    );
  } catch (error) {
    return failure(c, error);
  }
});

router.put(
  '/:id/changes/:key/reviewed',
  requireRole(UserRole.Editor),
  zValidator('json', reviewedSchema),
  async (c) => {
    const id = c.req.param('id');
    try {
      await changeSets(c).markReviewed(
        id,
        c.req.param('key'),
        c.req.valid('json').reviewed,
      );
      announce(c, id, 'reviewed');
      return c.body(null, 204);
    } catch (error) {
      return failure(c, error);
    }
  },
);

router.post(
  '/:id/changes/:key/revert',
  requireRole(UserRole.Editor),
  async (c) => {
    const id = c.req.param('id');
    try {
      await changeSets(c).revertCard(id, c.req.param('key'));
      announce(c, id, 'reverted');
      return c.body(null, 204);
    } catch (error) {
      return failure(c, error);
    }
  },
);

router.post(
  '/:id/update',
  requireRole(UserRole.Editor),
  zValidator('json', updateChangeSetSchema),
  async (c) => {
    const id = c.req.param('id');
    try {
      const result = await changeSets(c).update(
        id,
        c.req.valid('json').resolutions,
      );
      if (result.updated) {
        announce(c, id, 'updated');
      }
      return c.json(result);
    } catch (error) {
      return failure(c, error);
    }
  },
);

router.post('/:id/merge', requireRole(UserRole.Editor), async (c) => {
  const id = c.req.param('id');
  try {
    const info = await changeSets(c).merge(id);
    announce(c, id, 'merged');
    return c.json(info);
  } catch (error) {
    return failure(c, error);
  }
});

export default router;
