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

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CommandManager, ResourceType } from '@cyberismo/data-handler';

/**
 * Create a successful MCP tool result with JSON content.
 */
export function toolResult(data: Record<string, unknown>) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ success: true, ...data }, null, 2),
      },
    ],
  };
}

/**
 * Create an MCP tool error result.
 */
export function toolError(action: string, error: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: `Error ${action}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      },
    ],
    isError: true as const,
  };
}

interface ResourceTypeConfig {
  name: string;
  uri: string;
  description: string;
  resourceType: ResourceType;
}

/**
 * Register a resource that lists all items of a given resource type
 * by calling showResources + showResource for each item.
 */
export function registerResourceType(
  server: McpServer,
  commands: CommandManager,
  config: ResourceTypeConfig,
): void {
  server.resource(
    config.name,
    config.uri,
    { description: config.description, mimeType: 'application/json' },
    async () => {
      const names = await commands.showCmd.showResources(config.resourceType);
      const details = await Promise.all(
        names.map((name) =>
          commands.showCmd.showResource(name, config.resourceType),
        ),
      );
      return {
        contents: [
          {
            uri: config.uri,
            mimeType: 'application/json',
            text: JSON.stringify(details, null, 2),
          },
        ],
      };
    },
  );
}
