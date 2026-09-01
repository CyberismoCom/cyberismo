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
import { join, sep } from 'node:path';

import { copyDir } from '../src/utils/file-utils.js';
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
const prefix = 'test';

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

async function loadedTree(): Promise<CardTree> {
  const tree = new CardTree(prefix);
  await tree.load(testProjectPath);
  return tree;
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
      const tree = new CardTree(prefix);
      expect(tree).toBeInstanceOf(CardTree);
      expect(tree.isPopulated).toBe(false);
    });

    it('loads cards from a filesystem path', async () => {
      const tree = await loadedTree();
      expect(tree.isPopulated).toBe(true);
      expect(tree.cardKeysIn('project')).toEqual([
        'test_1',
        'test_2',
        'test_3',
      ]);
      expect(tree.cardKeysIn('test/templates/page')).toEqual(['test_4']);
    });

    it('handles an invalid path gracefully', async () => {
      const tree = new CardTree(prefix);
      await tree.load('/invalid/path/that/does/not/exist');

      expect(tree.isPopulated).toBe(true);
      expect(tree.cardKeysIn('project')).toHaveLength(0);
    });

    it('clear empties the tree and resets the populated state', async () => {
      const tree = await loadedTree();
      expect(tree.isPopulated).toBe(true);
      expect(tree.has('test_1')).toBe(true);

      tree.clear();
      expect(tree.isPopulated).toBe(false);
      expect(tree.has('test_1')).toBe(false);
      expect(tree.cardCountIn('project')).toBe(0);
    });
  });

  describe('reading cards', () => {
    let tree: CardTree;

    beforeAll(async () => {
      createTestData();
      tree = await loadedTree();
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

    it('returns the cards of a location', () => {
      const cards = tree.cardsIn('project');
      expect(cards.map((card) => card.key)).toEqual([
        'test_1',
        'test_2',
        'test_3',
      ]);
      expect(
        tree.cardsIn('test/templates/page').map((card) => card.key),
      ).toEqual(['test_4']);
    });

    it('returns every template card', () => {
      const templateCards = tree.allTemplateCards();
      expect(templateCards.map((card) => card.key)).toEqual(['test_4']);
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

    it('updates an existing card', () => {
      const original = tree.card('test_1');

      tree.updateCard('test_1', {
        ...original,
        metadata: { ...original.metadata!, title: 'Updated Title' },
      });

      expect(tree.card('test_1').metadata!.title).toBe('Updated Title');
    });

    it('adds a card the tree does not hold yet', () => {
      expect(tree.has('test_new')).toBe(false);

      tree.updateCard('test_new', {
        key: 'test_new',
        path: join(testCardsPath, 'test_new'),
        children: [],
        attachments: [],
        metadata: { ...pageCard('New Card'), links: [] },
      });

      expect(tree.has('test_new')).toBe(true);
      expect(tree.card('test_new').metadata!.title).toBe('New Card');
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
      mkdirSync(unknown.path, { recursive: true });
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
      mkdirSync(unknown.path, { recursive: true });
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

    it('does not leak the store-internal location field', () => {
      for (const card of [
        tree.card('test_1'),
        ...tree.cardsIn('project'),
        ...tree.rootCardsIn('project'),
        ...tree.cardsFor(['test_1']),
        ...tree.allTemplateCards(),
      ]) {
        expect(card).not.toHaveProperty('location');
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

      const tree = new CardTree(prefix);
      await expect(tree.load(testProjectPath)).rejects.toThrow(
        `Invalid JSON in file '${join(invalidCardPath, 'index.json')}'`,
      );

      rmSync(invalidCardPath, { recursive: true, force: true });
    });
  });

  describe('index consistency', () => {
    beforeEach(() => {
      mkdirSync(testCardsPath, { recursive: true });
    });
    afterEach(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    function expectedLocation(location: string): string {
      return location === 'project' ? 'project' : `test/templates/${location}`;
    }

    // A card's location is derived from its path, so these paths are what
    // actually drive the location index.
    function pathFor(location: string, cardKey: string): string {
      return location === 'project'
        ? join(testCardsPath, cardKey)
        : join(templateCardsPath(location), cardKey);
    }

    function cardAt(location: string, cardKey: string, parent: string): Card {
      return {
        key: cardKey,
        path: pathFor(location, cardKey),
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

    async function treeWith(...cards: Card[]): Promise<CardTree> {
      const tree = new CardTree(prefix);
      await tree.load(testCardsPath);
      for (const card of cards) {
        tree.updateCard(card.key, card);
      }
      return tree;
    }

    it('re-parenting removes the card from its old parent', async () => {
      const tree = await treeWith(
        cardAt('project', 'test_1', 'root'),
        cardAt('project', 'test_2', 'root'),
        cardAt('project', 'test_3', 'test_1'),
      );

      tree.updateCard('test_3', { ...tree.card('test_3'), parent: 'test_2' });

      expect(tree.childrenOf('test_1')).toEqual([]);
      expect(tree.card('test_1').children).toEqual([]);
    });

    it('re-parenting adds the card to its new parent', async () => {
      const tree = await treeWith(
        cardAt('project', 'test_1', 'root'),
        cardAt('project', 'test_2', 'root'),
        cardAt('project', 'test_3', 'test_1'),
      );

      tree.updateCard('test_3', { ...tree.card('test_3'), parent: 'test_2' });

      expect(tree.childrenOf('test_2')).toEqual(['test_3']);
      expect(tree.card('test_2').children).toEqual(['test_3']);
    });

    it('relocating a card moves it between the location sets', async () => {
      const tree = await treeWith(cardAt('project', 'test_1', 'root'));

      tree.updateCard('test_1', cardAt('alpha', 'test_1', 'root'));

      expect(tree.cardKeysIn('project')).toEqual([]);
      expect(tree.cardKeysIn(expectedLocation('alpha'))).toEqual(['test_1']);
      expect(tree.cardCountIn(expectedLocation('alpha'))).toBe(1);
    });

    it('deleting a card clears it from both indexes', async () => {
      const tree = await treeWith(
        cardAt('project', 'test_1', 'root'),
        cardAt('project', 'test_2', 'test_1'),
      );

      await tree.deleteSubtree('test_2');

      expect(tree.childrenOf('test_1')).toEqual([]);
      expect(tree.cardKeysIn('project')).toEqual(['test_1']);
    });

    it('re-storing a card does not duplicate its index entries', async () => {
      const tree = await treeWith(
        cardAt('project', 'test_1', 'root'),
        cardAt('project', 'test_2', 'test_1'),
      );

      tree.updateCard('test_2', { ...tree.card('test_2') });

      expect(tree.childrenOf('test_1')).toEqual(['test_2']);
      expect(tree.cardKeysIn('project')).toEqual(['test_1', 'test_2']);
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
      const template = templateResource.templateObject();
      await template.addCard('decision/cardTypes/decision');
      await template.addCard('decision/cardTypes/simplepage');

      // Verify cards from template are in cache
      const templateCards = template.cards();
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

      const template = commands.project.resources
        .byType(name, 'templates')
        .templateObject();
      await template.addCard('decision/cardTypes/decision');

      const templateCards = template.cards();
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

      const tree = new CardTree(prefix);
      await tree.load(dupCardsPath);
      expect(tree.content('test_1')).toBe('project card');

      await expect(tree.load(dupTemplatePath)).rejects.toThrow(
        DuplicateCardKeyError,
      );

      expect(tree.content('test_1')).toBe('project card');
    });

    it('rejects a key duplicated inside one populate batch', async () => {
      createTestCard('test_1', dupCardsPath, cardMetadata, 'root card');
      createTestCard('test_2', dupCardsPath, cardMetadata, 'other root card');
      const nested = join(dupCardsPath, 'test_2', 'c');
      createTestCard('test_1', nested, cardMetadata, 'nested card');

      const tree = new CardTree(prefix);
      await expect(tree.load(dupCardsPath)).rejects.toThrow(
        DuplicateCardKeyError,
      );
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
});
