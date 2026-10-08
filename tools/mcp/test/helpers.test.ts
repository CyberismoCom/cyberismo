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

import { describe, expect, test } from 'vitest';
import {
  decodeAttachment,
  toolResult,
  toolError,
} from '../src/lib/mcp-helpers.js';
import { MAX_ATTACHMENT_BYTES } from '@cyberismo/data-handler/utils/constants';

describe('toolResult', () => {
  test('wraps data with success: true', () => {
    const result = toolResult({ cardKey: 'abc_1' });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.cardKey).toBe('abc_1');
  });

  test('serializes nested objects', () => {
    const result = toolResult({
      created: [{ key: 'a_1', title: 'Test' }],
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.created[0].key).toBe('a_1');
  });
});

describe('toolError', () => {
  test('formats Error instances', () => {
    const result = toolError('creating card', new Error('Not found'));

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Error creating card: Not found');
  });

  test('handles non-Error values', () => {
    const result = toolError('doing something', 'string error');

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Error doing something: Unknown error');
  });
});

describe('decodeAttachment', () => {
  test('decodes valid base64', () => {
    expect(decodeAttachment('aGVsbG8=').toString()).toBe('hello');
    expect(decodeAttachment('').length).toBe(0);
  });

  test.each([['not base64!'], ['abc'], ['aGVsbG8=x'], ['aGVs=G8=']])(
    "rejects invalid base64 '%s'",
    (content) => {
      expect(() => decodeAttachment(content)).toThrow('not valid base64');
    },
  );

  test('accepts content of exactly the maximum size', () => {
    const content = Buffer.alloc(MAX_ATTACHMENT_BYTES).toString('base64');
    expect(decodeAttachment(content).length).toBe(MAX_ATTACHMENT_BYTES);
  });

  test('rejects content over the maximum size', () => {
    const content = Buffer.alloc(MAX_ATTACHMENT_BYTES + 1).toString('base64');
    expect(() => decodeAttachment(content)).toThrow('too large');
  });
});
