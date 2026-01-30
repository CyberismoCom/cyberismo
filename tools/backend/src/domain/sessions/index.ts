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

import { Hono } from 'hono';
import * as sessionsService from './service.js';
import { startSessionSchema } from './schema.js';

const router = new Hono();

/**
 * @swagger
 * /api/sessions:
 *   get:
 *     summary: List all active edit sessions.
 *     parameters:
 *       - name: cardKey
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *         description: Filter by card key to get session for a specific card
 *     responses:
 *       200:
 *         description: List of active edit sessions
 *       500:
 *         description: Internal server error
 */
router.get('/', async (c) => {
  const commands = c.get('commands');
  const cardKey = c.req.query('cardKey');

  try {
    if (cardKey) {
      // Get session for a specific card
      const session = await sessionsService.getSessionForCard(commands, cardKey);
      return c.json(session ? [session] : []);
    }
    // List all sessions
    const sessions = await sessionsService.listSessions(commands);
    return c.json(sessions);
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
});

/**
 * @swagger
 * /api/sessions:
 *   post:
 *     summary: Start a new edit session for a card.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - cardKey
 *             properties:
 *               cardKey:
 *                 type: string
 *                 description: The card key to start editing
 *     responses:
 *       200:
 *         description: Edit session created successfully
 *       400:
 *         description: Invalid request or session already exists
 *       500:
 *         description: Internal server error
 */
router.post('/', async (c) => {
  const commands = c.get('commands');

  try {
    const body = await c.req.json();
    const parseResult = startSessionSchema.safeParse(body);

    if (!parseResult.success) {
      return c.json(
        { error: parseResult.error.issues[0]?.message || 'Invalid request' },
        400,
      );
    }

    const { cardKey } = parseResult.data;
    const session = await sessionsService.startSession(commands, cardKey);
    return c.json(session);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    // Check for specific error types that indicate client errors
    if (
      message.includes('already exists') ||
      message.includes('not found') ||
      message.includes('does not exist') ||
      message.includes('uncommitted changes') ||
      message.includes('not a Git repository')
    ) {
      return c.json({ error: message }, 400);
    }
    return c.json({ error: message }, 500);
  }
});

// IMPORTANT: Static routes must come BEFORE parameterized routes (:id)

/**
 * @swagger
 * /api/sessions/cleanup:
 *   post:
 *     summary: Clean up orphaned sessions.
 *     description: Removes sessions whose worktrees no longer exist on disk.
 *     responses:
 *       200:
 *         description: Cleanup completed successfully
 *       500:
 *         description: Internal server error
 */
router.post('/cleanup', async (c) => {
  const commands = c.get('commands');

  try {
    await sessionsService.cleanup(commands);
    return c.json({ message: 'Cleanup completed' });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
});

/**
 * @swagger
 * /api/sessions/card/{cardKey}:
 *   get:
 *     summary: Check if a card has an active edit session.
 *     parameters:
 *       - name: cardKey
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Card key
 *     responses:
 *       200:
 *         description: Returns whether the card has an active session
 *       500:
 *         description: Internal server error
 */
router.get('/card/:cardKey', async (c) => {
  const commands = c.get('commands');
  const cardKey = c.req.param('cardKey');

  try {
    const hasSession = await sessionsService.hasActiveSession(commands, cardKey);
    const session = hasSession
      ? await sessionsService.getSessionForCard(commands, cardKey)
      : null;
    return c.json({ hasSession, session });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
});

// Parameterized routes come after static routes

/**
 * @swagger
 * /api/sessions/{id}:
 *   get:
 *     summary: Get an edit session by ID.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Session ID
 *     responses:
 *       200:
 *         description: Edit session details
 *       404:
 *         description: Session not found
 *       500:
 *         description: Internal server error
 */
router.get('/:id', async (c) => {
  const commands = c.get('commands');
  const sessionId = c.req.param('id');

  try {
    const session = await sessionsService.getSession(commands, sessionId);
    if (!session) {
      return c.json({ error: `Session not found: ${sessionId}` }, 404);
    }
    return c.json(session);
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
});

/**
 * @swagger
 * /api/sessions/{id}/save:
 *   post:
 *     summary: Save (commit) changes in an edit session.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Session ID
 *     responses:
 *       200:
 *         description: Changes saved successfully
 *       400:
 *         description: Save failed or session not found
 *       500:
 *         description: Internal server error
 */
router.post('/:id/save', async (c) => {
  const commands = c.get('commands');
  const sessionId = c.req.param('id');

  try {
    const result = await sessionsService.saveSession(commands, sessionId);
    if (result.success) {
      return c.json(result);
    }
    return c.json({ error: result.message || 'Save failed' }, 400);
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
});

/**
 * @swagger
 * /api/sessions/{id}/publish:
 *   post:
 *     summary: Publish (merge) an edit session to the main branch.
 *     description: Merges the session's changes into main using "theirs" strategy (last write wins) for conflict resolution.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Session ID
 *     responses:
 *       200:
 *         description: Session published successfully
 *       400:
 *         description: Publish failed or session not found
 *       500:
 *         description: Internal server error
 */
router.post('/:id/publish', async (c) => {
  const commands = c.get('commands');
  const sessionId = c.req.param('id');

  try {
    const result = await sessionsService.publishSession(commands, sessionId);
    if (result.success) {
      return c.json(result);
    }
    return c.json(
      { error: result.message || 'Publish failed', conflicts: result.conflicts },
      400,
    );
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
});

/**
 * @swagger
 * /api/sessions/{id}:
 *   delete:
 *     summary: Discard an edit session.
 *     description: Removes the worktree and deletes the branch, discarding all changes.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Session ID
 *     responses:
 *       204:
 *         description: Session discarded successfully
 *       404:
 *         description: Session not found
 *       500:
 *         description: Internal server error
 */
router.delete('/:id', async (c) => {
  const commands = c.get('commands');
  const sessionId = c.req.param('id');

  try {
    await sessionsService.discardSession(commands, sessionId);
    return new Response(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('not found')) {
      return c.json({ error: message }, 404);
    }
    return c.json({ error: message }, 500);
  }
});

export default router;
