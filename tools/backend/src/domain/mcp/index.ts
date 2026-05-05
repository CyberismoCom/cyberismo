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
import { randomUUID } from 'node:crypto';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createMcpServer, type ProjectProvider } from '@cyberismo/mcp';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { requireRole } from '../../middleware/auth.js';
import { UserRole, type AppVars } from '../../types.js';

const MAX_SESSIONS = 100;
const MAX_SESSIONS_PER_USER = 5;
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface McpSession {
  transport: WebStandardStreamableHTTPServerTransport;
  server: McpServer;
  lastActivity: number;
  userId: string;
}

const sessions = new Map<string, McpSession>();

/**
 * Close and remove a session, shutting down both server and transport.
 * Safe to call multiple times for the same id.
 * When `skipTransportClose` is true the transport is already closing
 * (called from onsessionclosed / onclose callbacks).
 */
async function destroySession(
  id: string,
  skipTransportClose = false,
): Promise<void> {
  const session = sessions.get(id);
  if (!session) return;
  sessions.delete(id);

  try {
    await session.server.close();
  } catch {
    // Ignore close errors during cleanup
  }

  if (!skipTransportClose && session.transport.close) {
    try {
      await session.transport.close();
    } catch {
      // Ignore close errors during cleanup
    }
  }
}

// Periodic cleanup of expired sessions
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastActivity > SESSION_TIMEOUT_MS) {
      void destroySession(id);
    }
  }
}, CLEANUP_INTERVAL_MS);
cleanupInterval.unref();

/**
 * Create an MCP HTTP router that serves all projects via the given provider.
 */
export function createMcpRouter(
  provider: ProjectProvider,
): Hono<{ Variables: AppVars }> {
  const router = new Hono<{ Variables: AppVars }>();

  /**
   * MCP HTTP endpoint handler.
   * Supports POST (messages) and DELETE (session cleanup).
   */
  router.all('/', requireRole(UserRole.Editor), async (c) => {
    const sessionId = c.req.header('mcp-session-id');

    // Handle DELETE before routing to existing session so it always runs cleanup
    if (c.req.method === 'DELETE') {
      if (sessionId) {
        await destroySession(sessionId);
      }
      return c.json({ message: 'Session closed' });
    }

    // Handle existing session
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      session.lastActivity = Date.now();
      const response = await session.transport.handleRequest(c.req.raw);
      return response;
    }

    // Reject requests with an unknown session ID (e.g. after server restart)
    if (sessionId) {
      return c.json({ error: 'Unknown session ID' }, 404);
    }

    // Only allow POST to create new sessions (initialize)
    if (c.req.method !== 'POST') {
      return c.json(
        { error: 'Method not allowed. Use POST to initialize a session.' },
        405,
      );
    }

    // Reject new sessions when at capacity
    if (sessions.size >= MAX_SESSIONS) {
      return c.json({ error: 'Too many active sessions' }, 503);
    }

    const user = c.get('user')!;
    const userSessionCount = [...sessions.values()].filter(
      (s) => s.userId === user.id,
    ).length;
    if (userSessionCount >= MAX_SESSIONS_PER_USER) {
      return c.json({ error: 'Too many active sessions for this user' }, 503);
    }

    // Create new session for initialization
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (newSessionId: string) => {
        sessions.set(newSessionId, {
          transport,
          server,
          lastActivity: Date.now(),
          userId: user.id,
        });
      },
      onsessionclosed: (closedSessionId: string) => {
        void destroySession(closedSessionId, true);
      },
    });

    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) {
        void destroySession(sid, true);
      }
    };

    const server = createMcpServer(provider);
    await server.connect(transport);

    const response = await transport.handleRequest(c.req.raw);
    return response;
  });

  return router;
}
