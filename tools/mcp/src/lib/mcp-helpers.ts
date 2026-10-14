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

import type { ResourceType } from '@cyberismo/data-handler';
import { MAX_ATTACHMENT_BYTES } from '@cyberismo/data-handler/utils/constants';

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
 * Decodes base64-encoded attachment content.
 * Buffer.from() silently skips invalid characters, so the format is checked first.
 * @param content Base64-encoded content.
 * @returns decoded content
 * @throws if content is not valid base64, or is larger than MAX_ATTACHMENT_BYTES when decoded
 */
export function decodeAttachment(content: string): Buffer {
  const tooLarge = () =>
    new Error(
      `Attachment is too large, maximum is ${MAX_ATTACHMENT_BYTES} bytes`,
    );
  // Cheap check before decoding; the exact size is checked after decoding.
  if (content.length > Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4) {
    throw tooLarge();
  }
  if (content.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(content)) {
    throw new Error('Attachment content is not valid base64');
  }
  const buffer = Buffer.from(content, 'base64');
  if (buffer.length > MAX_ATTACHMENT_BYTES) {
    throw tooLarge();
  }
  return buffer;
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
