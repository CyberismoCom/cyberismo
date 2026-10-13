import { mkdirSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { copyDir } from '../src/utils/file-utils.js';
import {
  beforeAll,
  expect,
  afterAll,
  it,
  describe,
  beforeEach,
  afterEach,
} from 'vitest';
import type { Workspace } from '../src/workspace/workspace.js';
import { openTestWorkspace } from './helpers/open-test-workspace.js';
import { findCard } from '../src/cards/read.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-export-tests');
const decisionRecordsPath = join(testDir, 'valid/decision-records');

describe('adoc export', () => {
  let ws: Workspace;

  beforeAll(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    ws = await openTestWorkspace(decisionRecordsPath);
  });

  afterAll(() => {
    ws.checkout.dispose();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('refuses a card that is not in the project', async () => {
    await expect(ws.export.adoc('decision_999')).rejects.toThrow(
      "Card 'decision_999' does not exist in the project",
    );
  });

  it('gives the document and its attachments by path', async () => {
    const files = await ws.export.adoc('decision_5');

    expect(Object.keys(files)).toContain('index.adoc');
    expect(
      Object.keys(files).filter((path) => path !== 'index.adoc'),
    ).toContain('a/games.jpg');
    expect(files['a/games.jpg']).toEqual(
      await readFile(
        join(decisionRecordsPath, 'cardRoot/decision_5/a/games.jpg'),
      ),
    );
    const document = Buffer.from(files['index.adoc']).toString();
    expect(document).toMatch(/^:imagesdir: \.\/a\/\n== /);
    expect(document).toContain('|Card key|decision_5\n');
  });
});

describe('adoc export section order', () => {
  let orderTestDir: string;
  let projectPath: string;

  beforeEach(async () => {
    // Unique dir per test so the CommandManager singleton, keyed on project
    // path, is rebuilt with a fresh cache.
    orderTestDir = join(
      baseDir,
      `tmp-export-order-tests-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    projectPath = join(orderTestDir, 'valid/decision-records');
    mkdirSync(orderTestDir, { recursive: true });
    await copyDir('test/test-data/', orderTestDir);
  });

  afterEach(() => {
    rmSync(orderTestDir, { recursive: true, force: true });
  });

  it('orders the descendants of a card by rank', async () => {
    const ws = await openTestWorkspace(projectPath);
    const template = 'decision/templates/decision';

    // Two cards below the level the tree query orders, cached in creation
    // order and ranked the other way around.
    const firstCreated = (await ws.cards.create(template, 'decision_6'))[0].key;
    const lastCreated = (await ws.cards.create(template, 'decision_6'))[0].key;
    await ws.cards.rankFirst(lastCreated);

    const rankOrder = [lastCreated, firstCreated];
    expect(findCard(ws.checkout, 'decision_6').children).not.toEqual(rankOrder);

    await ws.checkout.calculationEngine.generate();
    const files = await ws.export.adoc();

    const adoc = Buffer.from(files['index.adoc']).toString();
    const positionOf = (cardKey: string) =>
      adoc.indexOf(`|Card key|${cardKey}\n`);
    expect(positionOf(lastCreated)).toBeGreaterThan(-1);
    expect(positionOf(lastCreated)).toBeLessThan(positionOf(firstCreated));
  });
});
