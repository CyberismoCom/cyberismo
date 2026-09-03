/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
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
import {
  expect,
  it,
  describe,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from 'vitest';

// node
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';

import { copyDir } from '../src/utils/file-utils.js';
import { CardKeyRegistry } from '../src/containers/project/card-keys.js';
import { CardTree } from '../src/containers/project/card-tree.js';
import type {
  Card,
  CardMetadata,
} from '../src/interfaces/project-interfaces.js';
import { CommandManager } from '../src/command-manager.js';
import {
  CardNotFoundError,
  DuplicateCardKeyError,
} from '../src/exceptions/index.js';
import { getTestProject } from './helpers/test-utils.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-card-tree-tests');
const testProjectPath = join(testDir, 'test-project');
const testCardsPath = join(testProjectPath, 'cardRoot');

function templateCardsPath(template: string): string {
  return join(testProjectPath, '.cards', 'local', 'templates', template, 'c');
}

// Writes a card folder with metadata and content files.
function createTestCard(
  cardKey: string,
  basePath: string,
  metadata: CardMetadata,
  content: string,
) {
  const cardPath = join(basePath, cardKey);
  mkdirSync(cardPath, { recursive: true });

  writeFileSync(
    join(cardPath, 'index.json'),
    JSON.stringify({ ...metadata, links: metadata.links ?? [] }, null, 2),
  );
  writeFileSync(join(cardPath, 'index.adoc'), content);
  return cardPath;
}

function pageCard(title: string, rank = '0|a'): CardMetadata {
  return {
    title,
    cardType: 'test/cardTypes/page',
    workflowState: 'Draft',
    rank,
  } as CardMetadata;
}

// The default tree: three project cards (test_2 and test_3 under test_1,
// test_1 carrying one attachment) and one template card.
function createTestData() {
  createTestCard(
    'test_1',
    testCardsPath,
    pageCard('Root Card', '1'),
    'This is the root card content.',
  );

  const childrenDir = join(testCardsPath, 'test_1', 'c');
  createTestCard(
    'test_2',
    childrenDir,
    pageCard('Child Card', '1'),
    'This is a child card content.',
  );
  createTestCard(
    'test_3',
    childrenDir,
    pageCard('Another Child Card', '2'),
    'This is another child card.',
  );

  createTestCard(
    'test_4',
    templateCardsPath('page'),
    pageCard('Template Card'),
    'This is a template card content.',
  );

  const attachmentDir = join(testCardsPath, 'test_1', 'a');
  mkdirSync(attachmentDir, { recursive: true });
  writeFileSync(
    join(attachmentDir, 'test-attachment.txt'),
    'Test attachment content',
  );
}

const PAGE_TEMPLATE = 'test/templates/page';

function projectTree(
  rootPath: string,
  keys = new CardKeyRegistry(() => 'test'),
): CardTree {
  return new CardTree({
    name: 'project',
    rootPath,
    writable: true,
    emitsCardFact: true,
    validationApplies: true,
    keys,
  });
}

function newTemplateTree(
  name: string,
  rootPath: string,
  keys: CardKeyRegistry,
  writable = true,
): CardTree {
  return new CardTree({
    name,
    rootPath,
    writable,
    emitsCardFact: false,
    validationApplies: false,
    keys,
  });
}

// The fixture's two trees, loaded, sharing one key registry.
async function loadedTrees(): Promise<{
  tree: CardTree;
  template: CardTree;
  keys: CardKeyRegistry;
}> {
  const keys = new CardKeyRegistry(() => 'test');
  const tree = projectTree(testCardsPath, keys);
  const template = newTemplateTree(
    PAGE_TEMPLATE,
    templateCardsPath('page'),
    keys,
  );
  await tree.load();
  if (existsSync(templateCardsPath('page'))) {
    await template.load();
  }
  return { tree, template, keys };
}

async function loadedTree(): Promise<CardTree> {
  return (await loadedTrees()).tree;
}

describe('Card tree', () => {
  describe('lifecycle', () => {
    beforeAll(() => {
      createTestData();
    });
    afterAll(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('starts unpopulated', () => {
      const tree = projectTree(testCardsPath);
      expect(tree).toBeInstanceOf(CardTree);
      expect(tree.isPopulated).toBe(false);
    });

    it('loads each tree from its root folder', async () => {
      const { tree, template } = await loadedTrees();
      expect(tree.isPopulated).toBe(true);
      expect(tree.keys()).toEqual(['test_1', 'test_2', 'test_3']);
      expect(template.keys()).toEqual(['test_4']);
    });

    it('handles an invalid path gracefully', async () => {
      const tree = projectTree('/invalid/path/that/does/not/exist');
      await tree.load();

      expect(tree.isPopulated).toBe(true);
      expect(tree.keys()).toHaveLength(0);
    });

    it('clear empties the tree and resets the populated state', async () => {
      const tree = await loadedTree();
      expect(tree.isPopulated).toBe(true);
      expect(tree.has('test_1')).toBe(true);

      tree.clear();
      expect(tree.isPopulated).toBe(false);
      expect(tree.has('test_1')).toBe(false);
      expect(tree.count).toBe(0);
    });
  });

  describe('reading cards', () => {
    let tree: CardTree;
    let template: CardTree;
    let keys: CardKeyRegistry;

    beforeAll(async () => {
      createTestData();
      ({ tree, template, keys } = await loadedTrees());
    });
    afterAll(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('returns a stored card', () => {
      const card = tree.card('test_1');
      expect(card.key).toBe('test_1');
      expect(card.metadata!.title).toBe('Root Card');
    });

    it('throws for a card the tree does not hold', () => {
      expect(() => tree.card('non_existing_card')).toThrow(CardNotFoundError);
      expect(() => tree.node('non_existing_card')).toThrow(CardNotFoundError);
      expect(() => tree.content('non_existing_card')).toThrow(
        CardNotFoundError,
      );
      expect(() => tree.attachmentsOf('non_existing_card')).toThrow(
        CardNotFoundError,
      );
    });

    it('tells whether it holds a card', () => {
      expect(tree.has('test_1')).toBe(true);
      expect(tree.has('non_existing_card')).toBe(false);
    });

    it('returns the cards of one container', () => {
      const cards = tree.cards();
      expect(cards.map((card) => card.key)).toEqual([
        'test_1',
        'test_2',
        'test_3',
      ]);
      expect(template.cards().map((card) => card.key)).toEqual(['test_4']);
    });

    it('records each card as owned by exactly its tree', () => {
      for (const cardKey of tree.keys()) {
        expect(keys.has(cardKey)).toBe(true);
        expect(keys.ownerOf(cardKey)).toBe(tree);
      }
      for (const cardKey of template.keys()) {
        expect(keys.has(cardKey)).toBe(true);
        expect(keys.ownerOf(cardKey)).toBe(template);
      }
      expect(keys.has('non_existing_card')).toBe(false);
      expect(keys.ownerOf('non_existing_card')).toBeUndefined();
    });

    it('holds the parent-child relationships', () => {
      expect(tree.childrenOf('test_1')).toEqual(['test_2', 'test_3']);
      expect(tree.card('test_1').children).toEqual(['test_2', 'test_3']);
    });
  });

  describe('updating cards', () => {
    let tree: CardTree;

    beforeAll(async () => {
      createTestData();
      tree = await loadedTree();
    });
    afterAll(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('adds a card the tree does not hold yet', () => {
      expect(tree.has('test_new')).toBe(false);

      tree.insert({
        key: 'test_new',
        path: join(testCardsPath, 'test_new'),
        children: [],
        attachments: [],
        metadata: { ...pageCard('New Card'), links: [] },
      });

      expect(tree.has('test_new')).toBe(true);
      expect(tree.card('test_new').metadata!.title).toBe('New Card');
      // Inserted at the location's root, so its folder is the root's.
      expect(tree.pathOf('test_new')).toBe(join(testCardsPath, 'test_new'));
    });

    it('persists card content and keeps the store in step', async () => {
      const card = tree.card('test_1');
      card.content = 'Updated content for test_1';

      expect(await tree.writeContent(card)).toBe(true);
      expect(tree.content('test_1')).toBe('Updated content for test_1');
      await expect(
        readFile(join(card.path, 'index.adoc'), 'utf-8'),
      ).resolves.toBe('Updated content for test_1');
    });

    it('returns false when writing content for an unknown card', async () => {
      const unknown: Card = {
        key: 'non_existing_card',
        path: join(testCardsPath, 'non_existing_card'),
        children: [],
        attachments: [],
        content: 'some content',
      };
      expect(await tree.writeContent(unknown)).toBe(false);
    });

    it('persists card metadata and keeps the store in step', async () => {
      const card = tree.card('test_1');
      card.metadata = {
        ...card.metadata!,
        title: 'Updated Metadata Title',
        workflowState: 'Published',
      };

      expect(await tree.writeMetadata(card)).toBe(true);
      const stored = tree.node('test_1').metadata!;
      expect(stored.title).toBe('Updated Metadata Title');
      expect(stored.workflowState).toBe('Published');

      const onDisk = JSON.parse(
        await readFile(join(card.path, 'index.json'), 'utf-8'),
      );
      expect(onDisk.title).toBe('Updated Metadata Title');
    });

    it('returns false when writing metadata for an unknown card', async () => {
      const unknown: Card = {
        key: 'non_existing_too',
        path: join(testCardsPath, 'non_existing_too'),
        children: [],
        attachments: [],
        metadata: { ...pageCard('Some title'), links: [] },
      };
      expect(await tree.writeMetadata(unknown)).toBe(false);
    });
  });

  describe('deleting cards', () => {
    let tree: CardTree;

    beforeAll(async () => {
      createTestData();
      tree = await loadedTree();
    });
    afterAll(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('deletes a card, its folder and its descendants', async () => {
      const rootPath = tree.card('test_1').path;

      expect(await tree.deleteSubtree('test_1')).toBe(true);

      for (const cardKey of ['test_1', 'test_2', 'test_3']) {
        expect(tree.has(cardKey)).toBe(false);
      }
      expect(existsSync(rootPath)).toBe(false);
    });

    it('returns false for a card the tree does not hold', async () => {
      expect(await tree.deleteSubtree('non_existing_card')).toBe(false);
    });
  });

  describe('attachments', () => {
    let tree: CardTree;

    beforeEach(async () => {
      createTestData();
      tree = await loadedTree();
    });
    afterEach(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it("lists a card's attachments", () => {
      expect(tree.attachmentsOf('test_1')).toEqual([
        {
          card: 'test_1',
          fileName: 'test-attachment.txt',
          path: join(testCardsPath, 'test_1', 'a'),
          mimeType: 'text/plain',
        },
      ]);
    });

    it('adds an attachment file and records it', async () => {
      const attachmentFolder = tree.attachmentFolderOf('test_2');
      await tree.addAttachment('test_2', 'new.pdf', Buffer.from('pdf body'));

      await expect(
        readFile(join(attachmentFolder, 'new.pdf'), 'utf-8'),
      ).resolves.toBe('pdf body');
      expect(tree.attachmentsOf('test_2')).toEqual([
        {
          card: 'test_2',
          fileName: 'new.pdf',
          path: attachmentFolder,
          mimeType: 'application/pdf',
        },
      ]);
    });

    it('refuses a duplicate attachment', async () => {
      await tree.addAttachment('test_2', 'twice.txt', Buffer.from('first'));
      await expect(
        tree.addAttachment('test_2', 'twice.txt', Buffer.from('second')),
      ).rejects.toThrow();

      expect(
        tree
          .attachmentsOf('test_2')
          .filter((attachment) => attachment.fileName === 'twice.txt'),
      ).toHaveLength(1);
      await expect(
        readFile(join(tree.attachmentFolderOf('test_2'), 'twice.txt'), 'utf-8'),
      ).resolves.toBe('first');
    });

    it('throws when adding to a card the tree does not hold', async () => {
      await expect(
        tree.addAttachment('non_existing_card', 'file.txt', Buffer.from('x')),
      ).rejects.toThrow(CardNotFoundError);
    });

    it('removes an attachment file and drops it from the listing', async () => {
      await tree.removeAttachment('test_1', 'test-attachment.txt');

      expect(tree.attachmentsOf('test_1')).toEqual([]);
      expect(
        existsSync(
          join(tree.attachmentFolderOf('test_1'), 'test-attachment.txt'),
        ),
      ).toBe(false);
    });

    it('throws when removing an attachment that is not there', async () => {
      await expect(
        tree.removeAttachment('test_1', 'non_existing_attachment.txt'),
      ).rejects.toThrow('Attachment not found');
    });

    it('throws when removing from a card the tree does not hold', async () => {
      await expect(
        tree.removeAttachment('non_existing_card', 'file.txt'),
      ).rejects.toThrow(CardNotFoundError);
    });
  });

  // Attachment listings come out of the one recursive sweep the load does,
  // so they must match what the folders actually hold.
  describe('attachment listings', () => {
    beforeEach(() => {
      mkdirSync(testCardsPath, { recursive: true });
    });
    afterEach(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    function attach(cardPath: string, name: string, dir = '') {
      const folder = join(cardPath, 'a', dir);
      mkdirSync(folder, { recursive: true });
      writeFileSync(join(folder, name), `body of ${name}`);
    }

    it('lists a card with no attachment folder as having none', async () => {
      createTestCard('test_1', testCardsPath, pageCard('Card'), 'content');
      const tree = await loadedTree();

      expect(tree.attachmentsOf('test_1')).toEqual([]);
    });

    it('records entries in folders below the attachment folder', async () => {
      const cardPath = createTestCard(
        'test_1',
        testCardsPath,
        pageCard('Card'),
        'content',
      );
      attach(cardPath, 'flat.png');
      attach(cardPath, 'nested.png', 'deep');
      const tree = await loadedTree();

      expect(
        tree
          .attachmentsOf('test_1')
          .map((item) => [item.fileName, item.path])
          .sort(),
      ).toEqual([
        ['deep', join(cardPath, 'a')],
        ['flat.png', join(cardPath, 'a')],
        ['nested.png', join(cardPath, 'a', 'deep')],
      ]);
    });

    it('gives a nested card its own attachments', async () => {
      const parentPath = createTestCard(
        'test_1',
        testCardsPath,
        pageCard('Parent'),
        'content',
      );
      const childPath = createTestCard(
        'test_2',
        join(parentPath, 'c'),
        pageCard('Child'),
        'content',
      );
      attach(parentPath, 'parent.png');
      attach(childPath, 'child.png');
      const tree = await loadedTree();

      expect(tree.attachmentsOf('test_1').map((item) => item.fileName)).toEqual(
        ['parent.png'],
      );
      const child = tree.attachmentsOf('test_2');
      expect(child.map((item) => item.fileName)).toEqual(['child.png']);
      expect(child[0].path).toBe(join(childPath, 'a'));
    });

    it("leaves a card's own files out of the listing", async () => {
      const cardPath = createTestCard(
        'test_1',
        testCardsPath,
        pageCard('Card'),
        'content',
      );
      createTestCard(
        'test_2',
        join(cardPath, 'c'),
        pageCard('Child'),
        'content',
      );
      attach(cardPath, 'real.png');
      const tree = await loadedTree();

      expect(tree.attachmentsOf('test_1').map((item) => item.fileName)).toEqual(
        ['real.png'],
      );
    });
  });

  describe('renaming attachments', () => {
    const CARD_KEY = 'test_1';
    const ATTACHMENT = 'diagram.png';
    let tree: CardTree;
    let cardPath: string;

    beforeEach(async () => {
      cardPath = createTestCard(
        CARD_KEY,
        testCardsPath,
        pageCard('Card'),
        'content',
      );
      mkdirSync(join(cardPath, 'a'), { recursive: true });
      writeFileSync(join(cardPath, 'a', ATTACHMENT), `body of ${ATTACHMENT}`);
      tree = await loadedTree();
    });

    afterEach(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('renames the file and updates the stored attachment', async () => {
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
      // primitive exists to close.
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

    it('refuses a new name that climbs out of the attachment folder', async () => {
      await expect(
        tree.renameAttachment(CARD_KEY, ATTACHMENT, join('..', 'escaped.png')),
      ).rejects.toThrow('Invalid attachment filename');

      await expect(
        readFile(join(cardPath, 'a', ATTACHMENT), 'utf-8'),
      ).resolves.toBe(`body of ${ATTACHMENT}`);
      expect(existsSync(join(cardPath, 'escaped.png'))).toBe(false);
      expect(tree.attachmentsOf(CARD_KEY)[0].fileName).toBe(ATTACHMENT);
    });

    it('refuses a new name with a path separator in it', async () => {
      await expect(
        tree.renameAttachment(CARD_KEY, ATTACHMENT, join('sub', 'moved.png')),
      ).rejects.toThrow('Invalid attachment filename');

      await expect(
        readFile(join(cardPath, 'a', ATTACHMENT), 'utf-8'),
      ).resolves.toBe(`body of ${ATTACHMENT}`);
      expect(tree.attachmentsOf(CARD_KEY)[0].fileName).toBe(ATTACHMENT);
    });

    // rename() replaces its destination silently, so this would have deleted
    // the other attachment's file and left the store with two entries for one.
    it('refuses to overwrite an attachment the card already has', async () => {
      await tree.addAttachment(
        CARD_KEY,
        'other.png',
        Buffer.from('body of other'),
      );

      await expect(
        tree.renameAttachment(CARD_KEY, ATTACHMENT, 'other.png'),
      ).rejects.toThrow('Attachment already exists: other.png');

      await expect(
        readFile(join(cardPath, 'a', ATTACHMENT), 'utf-8'),
      ).resolves.toBe(`body of ${ATTACHMENT}`);
      await expect(
        readFile(join(cardPath, 'a', 'other.png'), 'utf-8'),
      ).resolves.toBe('body of other');
      expect(
        tree
          .attachmentsOf(CARD_KEY)
          .map((attachment) => attachment.fileName)
          .sort(),
      ).toEqual([ATTACHMENT, 'other.png']);
    });
  });

  describe('read boundary', () => {
    let tree: CardTree;

    beforeAll(async () => {
      createTestData();
      const cardPath = join(testCardsPath, 'test_1');
      writeFileSync(
        join(cardPath, 'index.json'),
        JSON.stringify({
          ...pageCard('Root Card', '1'),
          links: [{ linkType: 'test/linkTypes/rel', cardKey: 'test_2' }],
        }),
      );
      tree = await loadedTree();
    });
    afterAll(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    // The metadata-level read shares the stored metadata object rather than
    // cloning it, so the store freezes what it holds. Without the freeze this
    // assignment silently rewrites the store.
    it('refuses writes to the metadata a node read shares', () => {
      const node = tree.node('test_1');
      expect(Object.isFrozen(node.metadata)).toBe(true);
      expect(() => {
        node.metadata!.title = 'edited';
      }).toThrow(TypeError);
      expect(tree.node('test_1').metadata!.title).toBe('Root Card');
    });

    it('refuses writes to the arrays and link objects inside stored metadata', () => {
      const links = tree.node('test_1').metadata!.links;
      expect(() => links.push({ linkType: 'x', cardKey: 'test_9' })).toThrow(
        TypeError,
      );
      expect(() => {
        links[0].linkType = 'edited';
      }).toThrow(TypeError);
      expect(tree.node('test_1').metadata!.links[0].linkType).toBe(
        'test/linkTypes/rel',
      );
    });

    it('hands out a card whose metadata can be edited without touching the store', () => {
      const card = tree.card('test_1');
      expect(Object.isFrozen(card.metadata)).toBe(false);

      card.metadata!.title = 'edited';
      card.metadata!.links.push({ linkType: 'x', cardKey: 'test_9' });

      expect(tree.card('test_1').metadata!.title).toBe('Root Card');
      expect(tree.card('test_1').metadata!.links).toHaveLength(1);
    });

    it('hands out attachments and children that can be edited without touching the store', () => {
      const card = tree.card('test_1');
      card.attachments[0].fileName = 'edited.png';
      card.children.push('test_9');

      expect(tree.card('test_1').attachments[0].fileName).toBe(
        'test-attachment.txt',
      );
      expect(tree.attachmentsOf('test_1')[0].fileName).toBe(
        'test-attachment.txt',
      );
      expect(tree.card('test_1').children).toEqual(['test_2', 'test_3']);
      expect(tree.childrenOf('test_1')).toEqual(['test_2', 'test_3']);
    });

    it('hands out only the fields a Card has', () => {
      for (const card of [
        tree.card('test_1'),
        ...tree.cards(),
        ...tree.rootCards(),
      ]) {
        expect(Object.keys(card).sort()).toEqual([
          'attachments',
          'children',
          'content',
          'key',
          'metadata',
          'parent',
          'path',
        ]);
      }
    });
  });

  describe('populating', () => {
    beforeAll(() => {
      createTestData();
    });
    afterAll(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('throws an error with the file path when index.json has invalid JSON', async () => {
      const invalidCardPath = join(testCardsPath, 'test_invalid');
      mkdirSync(invalidCardPath, { recursive: true });
      writeFileSync(
        join(invalidCardPath, 'index.json'),
        '{ "title": "Invalid Card", "cardType": "test/cardTypes/page", invalid json }',
      );
      writeFileSync(join(invalidCardPath, 'index.adoc'), 'Content');

      const tree = projectTree(testCardsPath);
      await expect(tree.load()).rejects.toThrow(
        `Invalid JSON in file '${join(invalidCardPath, 'index.json')}'`,
      );

      rmSync(invalidCardPath, { recursive: true, force: true });
    });

    it('refuses a card folder that is not inside a card', async () => {
      const strayParent = join(testCardsPath, 'stray');
      const strayCardPath = createTestCard(
        'test_stray',
        join(strayParent, 'c'),
        pageCard('Stray Card'),
        'Content',
      );

      const tree = projectTree(testCardsPath);
      await expect(tree.load()).rejects.toThrow(
        `Card folder '${strayCardPath}' is not inside a card's 'c' folder`,
      );

      rmSync(strayParent, { recursive: true, force: true });
    });
  });

  describe('index consistency', () => {
    beforeEach(() => {
      mkdirSync(testCardsPath, { recursive: true });
    });
    afterEach(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    const ALPHA_TEMPLATE = 'test/templates/alpha';

    function cardAt(cardKey: string, parent: string): Card {
      return {
        key: cardKey,
        path: join(testCardsPath, cardKey),
        parent,
        children: [],
        attachments: [],
        content: '',
        metadata: {
          title: cardKey,
          cardType: 'test/cardTypes/page',
          workflowState: 'Draft',
          rank: '1|a',
          links: [],
        },
      };
    }

    async function treesWith(
      ...cards: Card[]
    ): Promise<{ tree: CardTree; alpha: CardTree; keys: CardKeyRegistry }> {
      const keys = new CardKeyRegistry(() => 'test');
      const tree = projectTree(testCardsPath, keys);
      const alpha = newTemplateTree(
        ALPHA_TEMPLATE,
        templateCardsPath('alpha'),
        keys,
      );
      await tree.load();
      for (const card of cards) {
        tree.insert(card);
        // A relocate renames the card's folder, so the fixture needs one.
        createTestCard(
          card.key,
          dirname(tree.pathOf(card.key)),
          pageCard(card.key),
          '',
        );
      }
      return { tree, alpha, keys };
    }

    it('re-parenting removes the card from its old parent', async () => {
      const { tree } = await treesWith(
        cardAt('test_1', 'root'),
        cardAt('test_2', 'root'),
        cardAt('test_3', 'test_1'),
      );

      await tree.relocate('test_3', 'test_2');

      expect(tree.childrenOf('test_1')).toEqual([]);
      expect(tree.card('test_1').children).toEqual([]);
    });

    it('re-parenting adds the card to its new parent', async () => {
      const { tree } = await treesWith(
        cardAt('test_1', 'root'),
        cardAt('test_2', 'root'),
        cardAt('test_3', 'test_1'),
      );

      await tree.relocate('test_3', 'test_2');

      expect(tree.childrenOf('test_2')).toEqual(['test_3']);
      expect(tree.card('test_2').children).toEqual(['test_3']);
    });

    it('relocating a card renames its folder', async () => {
      const { tree } = await treesWith(
        cardAt('test_1', 'root'),
        cardAt('test_2', 'root'),
        cardAt('test_3', 'test_1'),
      );
      const vacated = tree.pathOf('test_3');

      await tree.relocate('test_3', 'test_2');

      expect(existsSync(vacated)).toBe(false);
      expect(existsSync(join(tree.pathOf('test_3'), 'index.json'))).toBe(true);
    });

    it('moving a card to another tree moves its key ownership', async () => {
      const { tree, alpha, keys } = await treesWith(cardAt('test_1', 'root'));

      alpha.graft(tree.uproot('test_1'), 'root');

      expect(tree.keys()).toEqual([]);
      expect(alpha.keys()).toEqual(['test_1']);
      expect(alpha.count).toBe(1);
      expect(keys.ownerOf('test_1')).toBe(alpha);
    });

    // Only the moved card's own edge changes; its descendants and their key
    // ownership follow it without a rewrite step.
    it('moving a card to another tree takes its descendants along', async () => {
      const { tree, alpha, keys } = await treesWith(
        cardAt('test_1', 'root'),
        cardAt('test_2', 'test_1'),
        cardAt('test_3', 'test_2'),
      );

      alpha.graft(tree.uproot('test_1'), 'root');

      expect(tree.keys()).toEqual([]);
      expect([...alpha.keys()].sort()).toEqual(['test_1', 'test_2', 'test_3']);
      expect(alpha.childrenOf('test_1')).toEqual(['test_2']);
      expect(keys.ownerOf('test_3')).toBe(alpha);
      // The subtree keeps its shape, and its paths are rederived from the
      // destination's root.
      expect(alpha.pathOf('test_3')).toBe(
        join(
          templateCardsPath('alpha'),
          'test_1',
          'c',
          'test_2',
          'c',
          'test_3',
        ),
      );
    });

    // The path changes with the edge: no rewrite step ran, and no stored path
    // could have gone stale.
    it('derives paths from the edges after a re-parent', async () => {
      const { tree } = await treesWith(
        cardAt('test_1', 'root'),
        cardAt('test_2', 'root'),
        cardAt('test_3', 'test_1'),
      );
      expect(tree.pathOf('test_3')).toBe(
        join(testCardsPath, 'test_1', 'c', 'test_3'),
      );

      await tree.relocate('test_3', 'test_2');

      expect(tree.pathOf('test_3')).toBe(
        join(testCardsPath, 'test_2', 'c', 'test_3'),
      );
      expect(tree.attachmentFolderOf('test_3')).toBe(
        join(testCardsPath, 'test_2', 'c', 'test_3', 'a'),
      );
    });

    it('deleting a card clears it from the indexes and the registry', async () => {
      const { tree, keys } = await treesWith(
        cardAt('test_1', 'root'),
        cardAt('test_2', 'test_1'),
      );

      await tree.deleteSubtree('test_2');

      expect(tree.childrenOf('test_1')).toEqual([]);
      expect(tree.keys()).toEqual(['test_1']);
      expect(keys.has('test_2')).toBe(false);
    });
  });

  describe('structural integrity', () => {
    // A three-generation line: test_1 -> test_2 -> test_3.
    beforeEach(() => {
      mkdirSync(testCardsPath, { recursive: true });
      createTestCard('test_1', testCardsPath, pageCard('One'), '');
      createTestCard(
        'test_2',
        join(testCardsPath, 'test_1', 'c'),
        pageCard('Two'),
        '',
      );
      createTestCard(
        'test_3',
        join(testCardsPath, 'test_1', 'c', 'test_2', 'c'),
        pageCard('Three'),
        '',
      );
    });
    afterEach(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it.each([
      ['its own child', 'test_1', 'test_2'],
      ['its own grandchild', 'test_1', 'test_3'],
      ['itself', 'test_2', 'test_2'],
    ])(
      'refuses to relocate a card under %s',
      async (_case, cardKey, parent) => {
        const tree = projectTree(testCardsPath);
        await tree.load();

        await expect(tree.relocate(cardKey, parent)).rejects.toThrow(
          `Card '${cardKey}' cannot be placed under '${parent}'`,
        );
        // And the tree is unchanged, so paths still resolve.
        expect(tree.pathOf('test_3')).toBe(
          join(testCardsPath, 'test_1', 'c', 'test_2', 'c', 'test_3'),
        );
      },
    );

    it('refuses to graft a subtree under one of its own cards', async () => {
      const tree = projectTree(testCardsPath);
      await tree.load();

      const subtree = tree.uproot('test_1');
      expect(subtree.map((card) => card.key)).toEqual([
        'test_1',
        'test_2',
        'test_3',
      ]);

      expect(() => tree.graft(subtree, 'test_2')).toThrow(
        `Card 'test_1' cannot be grafted under 'test_2'`,
      );
    });
  });

  describe('ranks', () => {
    beforeEach(() => {
      mkdirSync(testCardsPath, { recursive: true });
    });
    afterEach(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    // A loaded tree over root cards with the given ranks, keyed test_1..test_n.
    // A rank of '' leaves the card unranked.
    async function withRootRanks(...ranks: string[]): Promise<CardTree> {
      ranks.forEach((rank, index) =>
        createTestCard(
          `test_${index + 1}`,
          testCardsPath,
          pageCard(`Card ${index + 1}`, rank),
          '',
        ),
      );
      const tree = projectTree(testCardsPath);
      await tree.load();
      return tree;
    }

    it('allocates a block after the last ranked sibling of that parent', async () => {
      createTestCard('test_1', testCardsPath, pageCard('Root', '0|a'), '');
      createTestCard(
        'test_2',
        join(testCardsPath, 'test_1', 'c'),
        pageCard('Child', '0|f'),
        '',
      );
      const tree = projectTree(testCardsPath);
      await tree.load();

      expect(tree.rankBlock('test_1', 2)).toEqual(['0|g', '0|h']);
      // The parent's own sibling set is a different one.
      expect(tree.rankBlock('root', 1)).toEqual(['0|b']);
    });

    it('anchors a block on the first rank when nothing is ranked', async () => {
      const tree = await withRootRanks('', '');
      // '0|a' stays free, so rankFirst never has to demote its holder.
      expect(tree.rankBlock('root', 2)).toEqual(['0|b', '0|c']);
    });

    it('ranks a card first, demoting whoever holds the first rank', async () => {
      const tree = await withRootRanks('0|a', '0|m', '0|z');
      expect(tree.rankFirst('test_3')).toEqual([
        { cardKey: 'test_1', rank: '0|g' },
        { cardKey: 'test_3', rank: '0|a' },
      ]);
    });

    it('rebalances duplicate sibling ranks before placing a card', async () => {
      const tree = await withRootRanks('0|a', '0|b', '0|b');
      expect(tree.rankAfter('test_1', 'test_2')).toEqual([
        { cardKey: 'test_1', rank: '0|a' },
        { cardKey: 'test_2', rank: '0|m' },
        { cardKey: 'test_3', rank: '0|z' },
        { cardKey: 'test_1', rank: '0|s' },
      ]);
    });

    it('rebalances an unranked sibling set before placing a card', async () => {
      const tree = await withRootRanks('', '');
      expect(tree.rankAfter('test_2', 'test_1')).toEqual([
        { cardKey: 'test_1', rank: '0|a' },
        { cardKey: 'test_2', rank: '0|z' },
        // Then placed between the repaired ranks of the two siblings.
        { cardKey: 'test_2', rank: '0|m' },
      ]);
    });
  });

  describe('key ownership and writability', () => {
    beforeEach(() => {
      createTestData();
    });
    afterEach(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('rejects inserting a key another tree already holds', async () => {
      const { tree, template } = await loadedTrees();

      // test_1 is a project card; the template tree must refuse to claim it.
      expect(() =>
        template.insert({
          key: 'test_1',
          path: join(templateCardsPath('page'), 'test_1'),
          children: [],
          attachments: [],
          metadata: { ...pageCard('Clone'), links: [] },
        }),
      ).toThrow(DuplicateCardKeyError);

      expect(tree.has('test_1')).toBe(true);
      expect(template.has('test_1')).toBe(false);
    });

    it('a read-only tree refuses writes', async () => {
      const keys = new CardKeyRegistry(() => 'test');
      const module = newTemplateTree(
        'mod/templates/page',
        templateCardsPath('page'),
        keys,
        false,
      );
      await module.load();

      await expect(module.relocate('test_4', 'root')).rejects.toThrow(
        'Cannot modify imported module',
      );
      await expect(module.deleteSubtree('test_4')).rejects.toThrow(
        'Cannot modify imported module',
      );
      await expect(module.writeMetadata(module.card('test_4'))).rejects.toThrow(
        'Cannot modify imported module',
      );
      await expect(
        module.addAttachment('test_4', 'file.txt', Buffer.from('x')),
      ).rejects.toThrow('Cannot modify imported module');
      expect(module.has('test_4')).toBe(true);
    });

    it('refuses a move into a read-only tree before touching the disk', async () => {
      const { template, keys } = await loadedTrees();
      const module = newTemplateTree(
        'mod/templates/alpha',
        templateCardsPath('alpha'),
        keys,
        false,
      );

      await expect(module.adopt(template, 'test_4', 'root')).rejects.toThrow(
        'Cannot modify imported module',
      );

      expect(existsSync(join(templateCardsPath('page'), 'test_4'))).toBe(true);
      expect(template.has('test_4')).toBe(true);
      expect(module.has('test_4')).toBe(false);
      expect(keys.ownerOf('test_4')).toBe(template);
    });

    it('refuses a move out of a read-only tree before touching the disk', async () => {
      const keys = new CardKeyRegistry(() => 'test');
      const module = newTemplateTree(
        'mod/templates/page',
        templateCardsPath('page'),
        keys,
        false,
      );
      await module.load();
      const destination = newTemplateTree(
        'test/templates/alpha',
        templateCardsPath('alpha'),
        keys,
      );

      await expect(destination.adopt(module, 'test_4', 'root')).rejects.toThrow(
        'Cannot modify imported module',
      );

      expect(existsSync(join(templateCardsPath('page'), 'test_4'))).toBe(true);
      expect(module.has('test_4')).toBe(true);
      expect(destination.has('test_4')).toBe(false);
      expect(keys.ownerOf('test_4')).toBe(module);
    });
  });

  describe('Template and module operations', () => {
    const tempDir = join(baseDir, 'tmp-card-tree-tests');
    let decisionProjectPath: string;
    let commands: CommandManager;

    beforeEach(async () => {
      mkdirSync(tempDir, { recursive: true });
      await copyDir('test/test-data/', tempDir);

      // Set path and create CommandManager after directory exists
      decisionProjectPath = join(tempDir, 'valid', 'decision-records');

      commands = new CommandManager(decisionProjectPath, {});
      await commands.initialize();
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it('should create new template, add cards, and verify cards in cache', async () => {
      const name = 'decision/templates/testTemplate';
      const templateResource = commands.project.resources.byType(
        name,
        'templates',
      );
      await templateResource.create();
      commands.project.resources.changed();
      await commands.createCmd.addCards('decision/cardTypes/decision', name);
      await commands.createCmd.addCards('decision/cardTypes/simplepage', name);

      // Verify cards from template are in cache
      const templateCards = templateResource.cardTree.cards();
      expect(templateCards.length).toBe(2);

      // Check that template cards exist in project cache
      for (const templateCard of templateCards) {
        expect(commands.project.hasCard(templateCard.key)).toBe(true);
        const cachedCard = commands.project.findCard(templateCard.key);
        expect(cachedCard).toBeDefined();
        expect(cachedCard!.key).toBe(templateCard.key);
      }
    });

    it('should remove template and verify cards are gone from the cache', async () => {
      const name = 'decision/templates/testTemplate';
      const templateResource = commands.project.resources.byType(
        name,
        'templates',
      );
      await templateResource.create();
      commands.project.resources.changed();

      const template = commands.project.resources.byType(name, 'templates');
      await commands.createCmd.addCards('decision/cardTypes/decision', name);

      const templateCards = template.cardTree.cards();
      const templateCardKeys = templateCards.map((card) => card.key);
      for (const cardKey of templateCardKeys) {
        expect(commands.project.hasCard(cardKey)).toBe(true);
      }

      // Remove template
      const removeCmd = commands.removeCmd;
      await removeCmd.remove('template', name);
      for (const cardKey of templateCardKeys) {
        expect(commands.project.hasCard(cardKey)).toBe(false);
      }
    });

    it('should import base module and verify template cards in cache', async () => {
      const baseModule = 'https://github.com/CyberismoCom/module-base.git';
      await commands.importCmd.importModule(baseModule);

      const allTemplateCards = commands.project.allTemplateCards();
      const baseTemplateCards = allTemplateCards.filter((card: Card) =>
        card.path.includes(`base${sep}templates`),
      );

      expect(baseTemplateCards.length).toBeGreaterThan(0);
      for (const templateCard of baseTemplateCards) {
        expect(commands.project.hasCard(templateCard.key)).toBe(true);
        const cachedCard = commands.project.findCard(templateCard.key);
        expect(cachedCard).toBeDefined();
        expect(cachedCard!.key).toBe(templateCard.key);
      }
    }, 60000);

    it('should remove base module and verify template cards are gone from the cache', async () => {
      const baseModule = 'https://github.com/CyberismoCom/module-base.git';

      await commands.importCmd.importModule(baseModule);

      const allTemplateCards = commands.project.allTemplateCards();
      const baseTemplateCards = allTemplateCards.filter((card: Card) =>
        card.path.includes(`base${sep}templates`),
      );

      // Verify that module template cards are in cache
      expect(baseTemplateCards.length).toBeGreaterThan(0);
      for (const templateCard of baseTemplateCards) {
        expect(commands.project.hasCard(templateCard.key)).toBe(true);
        const cachedCard = commands.project.findCard(templateCard.key);
        expect(cachedCard).toBeDefined();
        expect(cachedCard!.key).toBe(templateCard.key);
      }

      // Get the imported module name
      const moduleEntry = commands.project.configuration.modules.find(
        (m) => m.location && m.location.includes('module-base'),
      );
      expect(moduleEntry).toBeDefined();

      // Remove module
      await commands.removeCmd.remove('module', moduleEntry!.name);

      // Verify module template cards are gone from the cache after removal
      const remainingTemplateCards = commands.project
        .allTemplateCards()
        .filter((card: Card) => card.path.includes(`base${sep}templates`));

      expect(remainingTemplateCards.length).toBe(0);
      for (const card of baseTemplateCards) {
        expect(commands.project.hasCard(card.key)).toBe(false);
      }
    }, 60000);
  });

  describe('duplicate card keys', () => {
    const dupDir = join(testDir, 'duplicate-key-project');
    const dupCardsPath = join(dupDir, 'cardRoot');
    const dupTemplatePath = join(
      dupDir,
      '.cards',
      'local',
      'templates',
      'dup',
      'c',
    );

    const cardMetadata = pageCard('Card', '1');

    beforeEach(() => {
      mkdirSync(dupCardsPath, { recursive: true });
      mkdirSync(dupTemplatePath, { recursive: true });
    });

    afterEach(() => {
      rmSync(dupDir, { recursive: true, force: true });
    });

    it('rejects a key already held from an earlier populate batch', async () => {
      createTestCard('test_1', dupCardsPath, cardMetadata, 'project card');
      createTestCard('test_1', dupTemplatePath, cardMetadata, 'template card');

      const keys = new CardKeyRegistry(() => 'test');
      const tree = projectTree(dupCardsPath, keys);
      const template = newTemplateTree(
        'test/templates/dup',
        dupTemplatePath,
        keys,
      );
      await tree.load();
      expect(tree.content('test_1')).toBe('project card');

      await expect(template.load()).rejects.toThrow(DuplicateCardKeyError);

      expect(tree.content('test_1')).toBe('project card');
      expect(keys.ownerOf('test_1')).toBe(tree);
    });

    it('rejects a key duplicated inside one populate batch', async () => {
      createTestCard('test_1', dupCardsPath, cardMetadata, 'root card');
      createTestCard('test_2', dupCardsPath, cardMetadata, 'other root card');
      const nested = join(dupCardsPath, 'test_2', 'c');
      createTestCard('test_1', nested, cardMetadata, 'nested card');

      const tree = projectTree(dupCardsPath);
      await expect(tree.load()).rejects.toThrow(DuplicateCardKeyError);
    });
  });

  describe('duplicate card keys across a project and its templates', () => {
    const projectPath = join(testDir, 'valid', 'decision-records');

    beforeEach(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data/', testDir);
    });

    afterEach(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('populateCaches reports a template card reusing a project card key', async () => {
      const templateCards = join(
        projectPath,
        '.cards',
        'local',
        'templates',
        'simplepage',
        'c',
      );
      createTestCard(
        'decision_5',
        templateCards,
        {
          title: 'Clashing template card',
          cardType: 'decision/cardTypes/decision',
          workflowState: '',
          rank: '0|a',
        } as CardMetadata,
        'clashing template card',
      );

      const project = getTestProject(projectPath);
      await expect(project.populateCaches()).rejects.toThrow(
        /Duplicate card keys found: decision_5/,
      );
    });
  });

  describe('fact changes', () => {
    let tree: CardTree;

    // A three-generation line: test_1 -> test_2 -> test_3.
    beforeEach(async () => {
      mkdirSync(testCardsPath, { recursive: true });
      createTestCard('test_1', testCardsPath, pageCard('One'), '');
      createTestCard(
        'test_2',
        join(testCardsPath, 'test_1', 'c'),
        pageCard('Two'),
        '',
      );
      createTestCard(
        'test_3',
        join(testCardsPath, 'test_1', 'c', 'test_2', 'c'),
        pageCard('Three'),
        '',
      );
      tree = projectTree(testCardsPath);
      await tree.load();
    });
    afterEach(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    // The tree is loaded in beforeEach, so a test that observes one
    // operation's marks starts from a drained tree.
    function drain() {
      tree.takeFactChanges();
    }

    function newCard(cardKey: string, parent: string): Card {
      return {
        key: cardKey,
        path: tree.pathFor(parent, cardKey),
        parent,
        children: [],
        attachments: [],
        content: '',
        metadata: { ...pageCard(cardKey), links: [] },
      };
    }

    it('marks every loaded card', () => {
      const changes = tree.takeFactChanges();
      expect(changes.changed.sort()).toEqual(['test_1', 'test_2', 'test_3']);
      expect(changes.removed).toEqual([]);
    });

    it('marks nothing for a content or an attachment write', async () => {
      drain();
      const card = tree.card('test_2');
      card.content = 'new body';
      await tree.writeContent(card);
      expect(tree.takeFactChanges()).toEqual({ changed: [], removed: [] });

      await tree.addAttachment('test_2', 'picture.png', Buffer.from('x'));
      expect(tree.takeFactChanges()).toEqual({ changed: [], removed: [] });

      await tree.removeAttachment('test_2', 'picture.png');
      expect(tree.takeFactChanges()).toEqual({ changed: [], removed: [] });
    });

    it('marks only the relocated card', async () => {
      drain();
      await tree.relocate('test_2', 'root');

      expect(tree.takeFactChanges()).toEqual({
        changed: ['test_2'],
        removed: [],
      });
    });

    it('marks an uprooted subtree removed and a grafted one changed', () => {
      drain();
      const subtree = tree.uproot('test_2');
      const uprooted = tree.takeFactChanges();
      expect(uprooted.changed).toEqual([]);
      expect(uprooted.removed.sort()).toEqual(['test_2', 'test_3']);

      tree.graft(subtree, 'root');
      expect(tree.takeFactChanges()).toEqual({
        changed: ['test_2', 'test_3'],
        removed: [],
      });
    });

    it('marks a card once, as whatever happened to it last', async () => {
      drain();
      await tree.deleteSubtree('test_3');
      createTestCard(
        'test_3',
        join(testCardsPath, 'test_1', 'c', 'test_2', 'c'),
        pageCard('Three'),
        '',
      );
      tree.insert(newCard('test_3', 'test_2'));
      expect(tree.takeFactChanges()).toEqual({
        changed: ['test_3'],
        removed: [],
      });

      const card = tree.card('test_3');
      card.metadata!.title = 'Renamed';
      await tree.writeMetadata(card);
      await tree.deleteSubtree('test_3');
      expect(tree.takeFactChanges()).toEqual({
        changed: [],
        removed: ['test_3'],
      });
    });

    it('marks every card of a cleared tree as removed', () => {
      drain();
      tree.clear();

      const changes = tree.takeFactChanges();
      expect(changes.changed).toEqual([]);
      expect(changes.removed.sort()).toEqual(['test_1', 'test_2', 'test_3']);
    });

    it('marks every card when the tree is renamed', () => {
      drain();
      tree.rebase(PAGE_TEMPLATE, testCardsPath);

      const changes = tree.takeFactChanges();
      expect(changes.changed.sort()).toEqual(['test_1', 'test_2', 'test_3']);
      expect(changes.removed).toEqual([]);
    });
  });
});
