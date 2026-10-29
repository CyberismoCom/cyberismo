// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { ResourceType } from '@cyberismo/model';

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
export interface ResourceTypeConfig {
  name: string;
  uri: string;
  description: string;
  resourceType: ResourceType;
}
