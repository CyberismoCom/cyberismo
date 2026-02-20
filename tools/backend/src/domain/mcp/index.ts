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
import { createMcpServer } from '@cyberismo/mcp/server';
import type { CommandManager } from '@cyberismo/data-handler';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const MAX_SESSIONS = 100;
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface McpSession {
  transport: WebStandardStreamableHTTPServerTransport;
  server: McpServer;
  commands: CommandManager;
  lastActivity: number;
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

const router = new Hono();

/**
 * MCP HTTP endpoint handler.
 * Supports GET (SSE streaming), POST (messages), and DELETE (session cleanup).
 */
router.all('/', async (c) => {
  const commands = c.get('commands');
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

  // Create new session for initialization
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (newSessionId: string) => {
      sessions.set(newSessionId, {
        transport,
        server,
        commands,
        lastActivity: Date.now(),
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

  const server = createMcpServer(commands);
  await server.connect(transport);

  const response = await transport.handleRequest(c.req.raw);
  return response;
});

/**
 * SSE endpoint for server-to-client messages
 */
router.get('/sse', async (c) => {
  const sessionId = c.req.header('mcp-session-id');

  if (!sessionId || !sessions.has(sessionId)) {
    return c.json({ error: 'Invalid or missing session ID' }, 400);
  }

  const session = sessions.get(sessionId)!;
  session.lastActivity = Date.now();
  const response = await session.transport.handleRequest(c.req.raw);
  return response;
});

export default router;
