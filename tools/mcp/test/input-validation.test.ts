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

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CommandManager } from '@cyberismo/data-handler';
import { createMcpServer, singleProjectProvider } from '../src/server.js';
import { testDataPath } from './test-utils.js';

// Tests of the tools that change project data. They run on a copy of the
// test project so that the shared test data stays unchanged.
let tempDir: string;
let projectPath: string;
let commands: CommandManager;
let client: Client;

beforeAll(async () => {
  process.argv = [];
  tempDir = mkdtempSync(join(tmpdir(), 'mcp-input-validation-'));
  projectPath = join(tempDir, 'decision-records');
  cpSync(testDataPath, projectPath, { recursive: true });
  commands = await CommandManager.getInstance(projectPath);

  const server = createMcpServer(singleProjectProvider(commands));
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(clientTransport);
});

afterAll(async () => {
  await client.close();
  commands.project.dispose();
  rmSync(tempDir, { recursive: true, force: true });
});

type TextContent = { type: string; text: string };

async function call(name: string, args: Record<string, unknown>) {
  return client.callTool({
    name,
    arguments: { projectPrefix: 'decision', ...args },
  });
}

// Invalid input is either rejected by the input schema, or reported as a tool error.
async function expectToolError(
  name: string,
  args: Record<string, unknown>,
  message?: string | RegExp,
) {
  let text: string;
  try {
    const result = await call(name, args);
    expect(result.isError).toBe(true);
    text = (result.content as TextContent[])[0].text;
  } catch (error) {
    text = error instanceof Error ? error.message : String(error);
  }
  if (message) {
    expect(text).toMatch(message);
  }
}

async function expectSuccess(name: string, args: Record<string, unknown>) {
  const result = await call(name, args);
  const text = (result.content as TextContent[])[0].text;
  expect(result.isError, text).toBeFalsy();
  return JSON.parse(text);
}

describe('create_card', () => {
  test('creates a card from a valid template', async () => {
    const parsed = await expectSuccess('create_card', {
      template: 'decision/templates/simplepage',
    });
    expect(parsed.created.length).toBeGreaterThan(0);
  });

  test.each([
    ['decision/templates/..'],
    ['decision/templates/doesNotExist'],
    ['decision/cardTypes/decision'],
    ['../../etc/passwd'],
    [''],
  ])("rejects template '%s'", async (template) => {
    await expectToolError('create_card', { template });
  });

  test('rejects an unknown parent card', async () => {
    await expectToolError('create_card', {
      template: 'decision/templates/simplepage',
      parentKey: 'decision_doesnotexist',
    });
  });

  test('rejects missing and wrongly typed arguments', async () => {
    await expectToolError('create_card', {});
    await expectToolError('create_card', { template: 42 });
  });
});

describe('edit_card_metadata', () => {
  test('changes the title of a card', async () => {
    await expectSuccess('edit_card_metadata', {
      cardKey: 'decision_5',
      field: 'title',
      value: 'Changed title',
    });
    expect(commands.project.findCard('decision_5').metadata?.title).toBe(
      'Changed title',
    );
  });

  test('rejects an unknown card', async () => {
    await expectToolError('edit_card_metadata', {
      cardKey: 'decision_doesnotexist',
      field: 'title',
      value: 'x',
    });
  });

  test('rejects an unknown field', async () => {
    await expectToolError('edit_card_metadata', {
      cardKey: 'decision_5',
      field: 'decision/fieldTypes/doesNotExist',
      value: 'x',
    });
  });

  test('rejects a value of an unsupported type', async () => {
    await expectToolError('edit_card_metadata', {
      cardKey: 'decision_5',
      field: 'title',
      value: { nested: 'object' },
    });
  });
});

describe('create_attachment', () => {
  test('adds a valid attachment', async () => {
    await expectSuccess('create_attachment', {
      cardKey: 'decision_5',
      filename: 'note.txt',
      content: Buffer.from('hello').toString('base64'),
    });
    expect(
      existsSync(join(projectPath, 'cardRoot/decision_5/a/note.txt')),
    ).toBe(true);
  });

  test.each([['not base64!'], ['abc'], ['aGVsbG8=x']])(
    "rejects invalid base64 '%s'",
    async (content) => {
      await expectToolError(
        'create_attachment',
        { cardKey: 'decision_5', filename: 'bad.txt', content },
        'not valid base64',
      );
      expect(
        existsSync(join(projectPath, 'cardRoot/decision_5/a/bad.txt')),
      ).toBe(false);
    },
  );

  test.each([['.'], ['..'], ['']])(
    "rejects file name '%s'",
    async (filename) => {
      await expectToolError('create_attachment', {
        cardKey: 'decision_5',
        filename,
        content: Buffer.from('x').toString('base64'),
      });
    },
  );

  test('rejects an unknown card', async () => {
    await expectToolError('create_attachment', {
      cardKey: 'decision_doesnotexist',
      filename: 'note.txt',
      content: Buffer.from('x').toString('base64'),
    });
  });
});

describe('remove_attachment', () => {
  test('refuses to remove files outside the attachment folder', async () => {
    for (const filename of ['../index.json', '../../.schema', '..', '.']) {
      await expectToolError('remove_attachment', {
        cardKey: 'decision_5',
        filename,
      });
    }
    expect(
      existsSync(join(projectPath, 'cardRoot/decision_5/index.json')),
    ).toBe(true);
  });

  test('rejects an attachment that does not exist', async () => {
    await expectToolError(
      'remove_attachment',
      { cardKey: 'decision_5', filename: 'doesNotExist.png' },
      'Attachment not found',
    );
  });

  test('removes an existing attachment', async () => {
    await expectSuccess('remove_attachment', {
      cardKey: 'decision_5',
      filename: 'games.jpg',
    });
    expect(
      existsSync(join(projectPath, 'cardRoot/decision_5/a/games.jpg')),
    ).toBe(false);
  });
});

describe('update_folder_resource', () => {
  const change = (to: string) => ({ name: 'change', target: '', to });

  test('updates the content template of a report', async () => {
    await expectSuccess('update_folder_resource', {
      resource: 'decision/reports/testReport',
      query: {
        key: 'content',
        subKey: 'contentTemplate',
        operation: change('Updated template'),
      },
    });
  });

  test.each([
    ['decision/reports/..'],
    ['decision/reports/.'],
    ['decision/reports/doesNotExist'],
    ['decision/cardTypes/decision'],
    ['decision/reports/a/b'],
  ])("rejects resource '%s'", async (resource) => {
    await expectToolError('update_folder_resource', {
      resource,
      query: {
        key: 'content',
        subKey: 'contentTemplate',
        operation: change('x'),
      },
    });
    expect(existsSync(join(projectPath, '.cards/local/reports'))).toBe(true);
  });

  test('rejects an unknown content sub-key', async () => {
    await expectToolError('update_folder_resource', {
      resource: 'decision/reports/testReport',
      query: { key: 'content', subKey: 'script.sh', operation: change('x') },
    });
  });
});

describe('update_file_resource', () => {
  test('updates the display name of a card type', async () => {
    await expectSuccess('update_file_resource', {
      resource: 'decision/cardTypes/decision',
      key: 'displayName',
      operation: { name: 'change', target: '', to: 'Decision record' },
    });
  });

  test.each([
    ['decision/cardTypes/..'],
    ['decision/cardTypes/doesNotExist'],
    ['decision/reports/testReport'],
  ])("rejects resource '%s'", async (resource) => {
    await expectToolError('update_file_resource', {
      resource,
      key: 'displayName',
      operation: { name: 'change', target: '', to: 'x' },
    });
  });

  test('rejects an unknown property key', async () => {
    await expectToolError('update_file_resource', {
      resource: 'decision/cardTypes/decision',
      key: 'notAProperty',
      operation: { name: 'change', target: '', to: 'x' },
    });
  });
});
