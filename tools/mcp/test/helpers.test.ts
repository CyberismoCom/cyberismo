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
import { toolResult, toolError } from '../src/lib/mcp-helpers.js';

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
