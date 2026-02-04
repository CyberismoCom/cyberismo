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
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createMcpServer } from '@cyberismo/mcp/server';
import type { CommandManager } from '@cyberismo/data-handler';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

interface McpSession {
  transport: WebStandardStreamableHTTPServerTransport;
  server: McpServer;
  commands: CommandManager;
}

// Session management: Map of sessionId -> session data
const sessions = new Map<string, McpSession>();

const router = new Hono();

/**
 * MCP HTTP endpoint handler.
 * Supports GET (SSE streaming), POST (messages), and DELETE (session cleanup).
 */
router.all('/', async (c) => {
  const commands = c.get('commands');
  const sessionId = c.req.header('mcp-session-id');

  // Handle existing session
  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId)!;
    const response = await session.transport.handleRequest(c.req.raw);
    return response;
  }

  // Handle DELETE for session cleanup (even without existing session)
  if (c.req.method === 'DELETE') {
    if (sessionId) {
      sessions.delete(sessionId);
    }
    return c.json({ message: 'Session closed' });
  }

  // Create new session for initialization (POST with initialize message)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    onsessioninitialized: (newSessionId: string) => {
      // Store session when initialized
      sessions.set(newSessionId, {
        transport,
        server,
        commands,
      });
    },
    onsessionclosed: (closedSessionId: string) => {
      // Clean up on session close
      sessions.delete(closedSessionId);
    },
  });

  // Handle transport close
  transport.onclose = () => {
    const sid = transport.sessionId;
    if (sid) {
      sessions.delete(sid);
    }
  };

  const server = createMcpServer(commands);
  await server.connect(transport);

  // Handle the initial request
  const response = await transport.handleRequest(c.req.raw);
  return response;
});

/**
 * SSE endpoint for server-to-client messages (optional, for long-polling clients)
 */
router.get('/sse', async (c) => {
  const sessionId = c.req.header('mcp-session-id');

  if (!sessionId || !sessions.has(sessionId)) {
    return c.json({ error: 'Invalid or missing session ID' }, 400);
  }

  const session = sessions.get(sessionId)!;
  const response = await session.transport.handleRequest(c.req.raw);
  return response;
});

export default router;
