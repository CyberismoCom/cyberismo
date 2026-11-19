// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Readable, Writable } from 'node:stream';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { ProjectDirectory } from '@cyberismo/data-handler';
import type { McpUser } from './lib/resolve-project.js';
import { createMcpServer, type McpServerOptions } from './server.js';

/**
 * Makes every message that `transport` receives carry `user` as its auth
 * info. The tools act as the user of a request (see `callerOf`). Over HTTP
 * the backend authenticates each request; a transport without
 * authentication, such as stdio, uses this to name the one local user.
 * @returns the same transport
 */
export function withUser<T extends Transport>(transport: T, user: McpUser): T {
  const authInfo: AuthInfo = {
    token: '',
    clientId: user.id,
    scopes: [],
    extra: { user },
  };
  let handler: Transport['onmessage'];
  Object.defineProperty(transport, 'onmessage', {
    configurable: true,
    get: () => handler,
    set: (receive: Transport['onmessage']) => {
      handler =
        receive &&
        ((message, extra) => receive(message, { ...extra, authInfo }));
    },
  });
  return transport;
}

export interface StdioServerOptions extends McpServerOptions {
  /** Where the requests come from. Default: standard input. */
  input?: Readable;
  /** Where the responses go. Default: standard output. */
  output?: Writable;
}

/**
 * Serves the projects of `directory` over stdio, as `user`. The caller must
 * keep everything else off the output stream: each line there is a protocol
 * message.
 * @returns the connected server
 */
export async function serveStdio(
  directory: ProjectDirectory,
  user: McpUser,
  options?: StdioServerOptions,
): Promise<McpServer> {
  const transport = withUser(
    new StdioServerTransport(options?.input, options?.output),
    user,
  );
  const server = createMcpServer(directory, options);
  await server.connect(transport);
  return server;
}
