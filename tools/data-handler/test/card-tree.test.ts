/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

// testing
import { expect, describe, it, beforeEach, afterEach } from 'vitest';

// node
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { CardTree } from '../src/containers/project/card-tree.js';
import { CardNotFoundError } from '../src/exceptions/index.js';
import type { CardMetadata } from '../src/interfaces/project-interfaces.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-card-tree-tests');
const cardRoot = join(testDir, 'cardRoot');
const prefix = 'test';

const CARD_KEY = 'test_1';
const ATTACHMENT = 'diagram.png';

function createCard(cardKey: string, attachments: string[] = []) {
  const cardPath = join(cardRoot, cardKey);
  mkdirSync(cardPath, { recursive: true });
  writeFileSync(
    join(cardPath, 'index.json'),
    JSON.stringify({
      title: 'Card',
      cardType: 'test/cardTypes/page',
      workflowState: 'Draft',
      rank: '0|a',
      links: [],
    } as CardMetadata),
  );
  writeFileSync(join(cardPath, 'index.adoc'), `image::${ATTACHMENT}[]\n`);

  if (attachments.length > 0) {
    mkdirSync(join(cardPath, 'a'), { recursive: true });
    for (const attachment of attachments) {
      writeFileSync(join(cardPath, 'a', attachment), `body of ${attachment}`);
    }
  }
  return cardPath;
}

describe('CardTree.renameAttachment', () => {
  let tree: CardTree;
  let cardPath: string;

  beforeEach(async () => {
    mkdirSync(cardRoot, { recursive: true });
    cardPath = createCard(CARD_KEY, [ATTACHMENT]);
    tree = new CardTree(prefix);
    await tree.load(cardRoot);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('renames the file and updates the cached attachment', async () => {
    const before = tree.attachmentsOf(CARD_KEY);
    expect(before).toHaveLength(1);
    expect(before[0].fileName).toBe(ATTACHMENT);
    expect(before[0].mimeType).toBe('image/png');

    await tree.renameAttachment(CARD_KEY, ATTACHMENT, 'renamed.svg');

    // On disk.
    await expect(
      readFile(join(cardPath, 'a', 'renamed.svg'), 'utf-8'),
    ).resolves.toBe(`body of ${ATTACHMENT}`);
    await expect(
      readFile(join(cardPath, 'a', ATTACHMENT), 'utf-8'),
    ).rejects.toThrow(/ENOENT/);

    // And in the tree: the old fileName going stale here is the defect this
    // primitive exists to close. The mime type follows the new extension, so
    // the entry matches what a reload from disk would produce.
    const after = tree.attachmentsOf(CARD_KEY);
    expect(after).toHaveLength(1);
    expect(after[0].fileName).toBe('renamed.svg');
    expect(after[0].mimeType).toBe('image/svg+xml');
    expect(after[0].card).toBe(CARD_KEY);
    expect(after[0].path).toBe(join(cardPath, 'a'));
  });

  it('is a no-op when the name does not change', async () => {
    await tree.renameAttachment(CARD_KEY, ATTACHMENT, ATTACHMENT);

    await expect(
      readFile(join(cardPath, 'a', ATTACHMENT), 'utf-8'),
    ).resolves.toBe(`body of ${ATTACHMENT}`);
    expect(tree.attachmentsOf(CARD_KEY)[0].fileName).toBe(ATTACHMENT);
  });

  it('throws for an attachment the card does not have', async () => {
    await expect(
      tree.renameAttachment(CARD_KEY, 'nope.png', 'other.png'),
    ).rejects.toThrow('Attachment not found: nope.png');
  });

  it('throws for a card the tree does not hold', async () => {
    await expect(
      tree.renameAttachment('test_999', ATTACHMENT, 'other.png'),
    ).rejects.toThrow(CardNotFoundError);
  });
});
