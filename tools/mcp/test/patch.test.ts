/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.

  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  contentOf,
  parseResult,
  setupMcpTest,
  testDataPath,
  type McpTestContext,
} from './test-utils.js';

// patch_card_content mutates cards, so run against an isolated copy of the
// fixture instead of the shared read-only project used by the other suites.
let tmpRoot: string;
let ctx: McpTestContext;

const CARD = 'decision_5';

async function setContent(content: string) {
  const result = await ctx.client.callTool({
    name: 'edit_card_content',
    arguments: { projectPrefix: 'decision', cardKey: CARD, content },
  });
  expect(result.isError).toBeFalsy();
}

async function patch(edits: unknown, cardKey = CARD) {
  return ctx.client.callTool({
    name: 'patch_card_content',
    arguments: { projectPrefix: 'decision', cardKey, edits },
  });
}

async function getRawContent(): Promise<string> {
  const result = await ctx.client.callTool({
    name: 'get_card',
    arguments: { projectPrefix: 'decision', cardKey: CARD },
  });
  expect(result.isError).toBeFalsy();
  return parseResult(result).card.rawContent;
}

beforeAll(async () => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'mcp-patch-'));
  cpSync(testDataPath, tmpRoot, { recursive: true });
  ctx = await setupMcpTest({ projectPath: tmpRoot });
});

afterAll(async () => {
  await ctx.cleanup();
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('patch_card_content', () => {
  test('applies a single edit and leaves surrounding text intact', async () => {
    await setContent('Hello world, hello again');
    const result = await patch([{ oldString: 'world', newString: 'there' }]);

    expect(result.isError).toBeFalsy();
    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);
    expect(parsed.editsApplied).toBe(1);
    expect(await getRawContent()).toBe('Hello there, hello again');
  });

  test('applies multiple edits in order', async () => {
    await setContent('one two three');
    const result = await patch([
      { oldString: 'one', newString: 'four' },
      { oldString: 'four two', newString: 'done' },
    ]);

    expect(result.isError).toBeFalsy();
    expect(await getRawContent()).toBe('done three');
  });

  test('inserts $-patterns in newString literally', async () => {
    // Regression: String.replace expanded $&, $$, $', $` in newString
    await setContent('cost X now');
    const result = await patch([{ oldString: 'X', newString: '$$5 or $&' }]);

    expect(result.isError).toBeFalsy();
    expect(await getRawContent()).toBe('cost $$5 or $& now');
  });

  test('errors when oldString is not found', async () => {
    await setContent('some content');
    const result = await patch([{ oldString: 'not-present', newString: 'x' }]);

    expect(result.isError).toBe(true);
    expect(contentOf(result)[0].text).toContain('Error patching content');
  });

  test('errors on ambiguous match without replaceAll', async () => {
    await setContent('dup dup dup');
    const result = await patch([{ oldString: 'dup', newString: 'x' }]);

    expect(result.isError).toBe(true);
  });

  test('replaceAll replaces every occurrence', async () => {
    await setContent('dup dup dup');
    const result = await patch([
      { oldString: 'dup', newString: 'x', replaceAll: true },
    ]);

    expect(result.isError).toBeFalsy();
    expect(await getRawContent()).toBe('x x x');
  });

  test('rejects an empty oldString', async () => {
    // Regression: empty oldString bypassed validation and shredded content
    await setContent('untouched');
    const result = await patch([
      { oldString: '', newString: 'x', replaceAll: true },
    ]);

    expect(result.isError).toBe(true);
    expect(await getRawContent()).toBe('untouched');
  });

  test('errors for an invalid card key', async () => {
    const result = await patch(
      [{ oldString: 'a', newString: 'b' }],
      'nonexistent_key_999',
    );

    expect(result.isError).toBe(true);
  });

  test('rejects an empty edits array', async () => {
    const result = await patch([]);

    expect(result.isError).toBe(true);
  });

  test('supports patching content produced by a previous patch call', async () => {
    await setContent('alpha beta gamma');
    await patch([{ oldString: 'beta', newString: 'BETA' }]);
    const result = await patch([
      { oldString: 'BETA gamma', newString: 'done' },
    ]);

    expect(result.isError).toBeFalsy();
    expect(await getRawContent()).toBe('alpha done');
  });
});
