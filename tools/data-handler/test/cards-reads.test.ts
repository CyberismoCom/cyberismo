// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Workspace } from '../src/api/workspace.js';
import { copyDir } from '../src/shared/utils/file-utils.js';
import { getTestBaseDir } from './helpers/test-utils.js';
import { openTestWorkspace } from './helpers/open-test-workspace.js';

const testDir = join(
  getTestBaseDir(import.meta.dirname, import.meta.url),
  'tmp-cards-reads-tests',
);

let ws: Workspace;

beforeAll(async () => {
  mkdirSync(testDir, { recursive: true });
  await copyDir(
    'test/test-data/valid/decision-records',
    join(testDir, 'valid/decision-records'),
  );
  ws = await openTestWorkspace(join(testDir, 'valid/decision-records'));
});

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

// A read returns plain data: what it returns survives a structuredClone
// unchanged, class instances and all.
describe('Cards reads return plain data', () => {
  const reads: [string, (cards: Workspace['cards']) => unknown][] = [
    ['list', (cards) => cards.list()],
    ['details', (cards) => cards.details('decision_5')],
    ['details with attachments', (cards) => cards.details('decision_1')],
    ['roots', (cards) => cards.roots()],
    ['templateCards', (cards) => cards.templateCards()],
    ['attachments', (cards) => cards.attachments()],
    [
      'attachment',
      // A Buffer is a Uint8Array, which is how bytes cross the API.
      async (cards) => {
        const file = await cards.attachment('decision_1', 'the-needle.heic');
        return { ...file, fileBuffer: new Uint8Array(file.fileBuffer) };
      },
    ],
  ];

  it.each(reads)('%s', async (_name, read) => {
    const result = await read(ws.cards);
    expect(result).toStrictEqual(structuredClone(result));
  });
});
