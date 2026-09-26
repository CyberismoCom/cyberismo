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
  ChangeSetInvalidError,
  ChangeSetNotFoundError,
} from '@cyberismo/data-handler';
import { requireRole } from '../../middleware/auth.js';
import { zValidator } from '../../middleware/zvalidator.js';
import { UserRole } from '../../types.js';
import {
  createChangeSetSchema,
  reviewedSchema,
  updateChangeSetSchema,
} from './schema.js';

/**
 * Manages a project's changeSets. The cards inside a changeSet are served
 * by the project routes mounted under /changesets/:changeSetId (app.ts).
 * Contract: tools/backend/README.md, "ChangeSets".
 */
const router = new Hono();
router.use('*', disableSSG());

const changeSets = (c: Context) =>
  c.get('registry').changeSetsFor(c.get('commands'));

// Tells the project's viewers a changeSet changed.
const announce = (c: Context, id: string, action: string) =>
  c.get('events').changeSetUpdated(id, action, c.get('user'));

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
  return c.json({ error: message }, 500);
}

router.get('/', requireRole(UserRole.Reader), async (c) => {
  return c.json(await changeSets(c).list());
});

router.post(
  '/',
  requireRole(UserRole.Editor),
  zValidator('json', createChangeSetSchema),
  async (c) => {
    try {
      const info = await changeSets(c).create(c.req.valid('json').title);
      announce(c, info.id, 'created');
      return c.json(info, 201);
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
