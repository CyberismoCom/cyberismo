import {
  expect,
  it,
  describe,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';

import { copyDir } from '../src/utils/file-utils.js';
import { CardTree } from '../src/containers/project/card-tree.js';
import { CardStore } from '../src/containers/project/card-store.js';
import { CardKeyRegistry } from '../src/containers/project/card-keys.js';
import {
  CardNotFoundError,
  DuplicateCardKeyError,
} from '../src/exceptions/index.js';
import { getTestProject } from './helpers/test-utils.js';
import type {
  Card,
  CardMetadata,
} from '../src/interfaces/project-interfaces.js';
import { CommandManager } from '../src/command-manager.js';

// Helper function to create test cards
function createTestCard(
  cardKey: string,
  basePath: string,
  metadata: CardMetadata,
  content: string,
) {
  const cardPath = join(basePath, cardKey);
  mkdirSync(cardPath, { recursive: true });

  const metadataWithLinks = {
    ...metadata,
    links: [],
  };
  writeFileSync(
    join(cardPath, 'index.json'),
    JSON.stringify(metadataWithLinks, null, 2),
  );
  writeFileSync(join(cardPath, 'index.adoc'), content);
}

function createTestData(testCardsPath: string, testTemplateCardsPath: string) {
  // Create test cards
  createTestCard(
    'test_1',
    testCardsPath,
    {
      title: 'Root Card',
      cardType: 'test/cardTypes/page',
      workflowState: 'Draft',
      rank: '1',
    } as CardMetadata,
    'This is the root card content.',
  );

  // Create child cards
  const test1Path = join(testCardsPath, 'test_1');
  const childrenDir = join(test1Path, 'c');
  mkdirSync(childrenDir, { recursive: true });

  createTestCard(
    'test_2',
    childrenDir,
    {
      title: 'Child Card',
      cardType: 'test/cardTypes/page',
      workflowState: 'Draft',
      rank: '1',
    } as CardMetadata,
    'This is a child card content.',
  );

  createTestCard(
    'test_3',
    childrenDir,
    {
      title: 'Another Child Card',
      cardType: 'test/cardTypes/page',
      workflowState: 'Published',
      rank: '2',
    } as CardMetadata,
    'This is another child card.',
  );

  // Create template card. The key has to satisfy the card-name rule, or it is
  // not a card folder at all: the old fixture's 'test_template_1' was silently
  // skipped by the loader, so nothing here ever exercised a template card.
  createTestCard(
    'test_9',
    testTemplateCardsPath,
    {
      title: 'Template Card',
      cardType: 'test/cardTypes/template',
      workflowState: 'Draft',
      rank: '1',
    } as CardMetadata,
    'This is a template card content.',
  );

  // Create attachment for test_1
  const attachmentDir = join(testCardsPath, 'test_1', 'a');
  mkdirSync(attachmentDir, { recursive: true });
  writeFileSync(
    join(attachmentDir, 'test-attachment.txt'),
    'Test attachment content',
  );
}

const TEMPLATE_NAME = 'test/templates/test';

// Trees as the project builds them: one registry, shared by all of them.
function projectTree(
  rootPath: string,
  keys = new CardKeyRegistry(() => 'test'),
) {
  return new CardTree({
    name: 'project',
    rootPath,
    writable: true,
    emitsCardFact: true,
    validationApplies: true,
    keys,
  });
}

function templateTree(
  name: string,
  rootPath: string,
  keys: CardKeyRegistry,
  writable = true,
) {
  return new CardTree({
    name,
    rootPath,
    writable,
    emitsCardFact: false,
    validationApplies: false,
    keys,
  });
}

describe('Card store', () => {
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-card-store-tests');
  const testProjectPath = join(testDir, 'test-project');
  const testCardsPath = join(testProjectPath, 'cardRoot');
  const testTemplateCardsPath = join(
    testProjectPath,
    '.cards',
    'local',
    'templates',
    'test',
    'c',
  );

  // The fixture's two trees, loaded, sharing one key registry.
  async function loadedTrees(): Promise<{
    tree: CardTree;
    template: CardTree;
    keys: CardKeyRegistry;
  }> {
    const keys = new CardKeyRegistry(() => 'test');
    const tree = projectTree(testCardsPath, keys);
    const template = templateTree(TEMPLATE_NAME, testTemplateCardsPath, keys);
    await tree.load();
    await template.load();
    return { tree, template, keys };
  }

  async function loadedTree(): Promise<CardTree> {
    return (await loadedTrees()).tree;
  }

  async function createFixture() {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    mkdirSync(testCardsPath, { recursive: true });
    mkdirSync(testTemplateCardsPath, { recursive: true });
    createTestData(testCardsPath, testTemplateCardsPath);
  }

  describe('operating the store', () => {
    beforeAll(createFixture);
    afterAll(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('should create a tree that is not populated yet', () => {
      const tree = projectTree(testCardsPath);
      expect(tree).toBeInstanceOf(CardTree);
      expect(tree.isPopulated).toBe(false);
    });

    it('should populate the store from a filesystem path', async () => {
      const tree = projectTree(testCardsPath);
      expect(tree.isPopulated).toBe(false);
      await tree.load();

      expect(tree.isPopulated).toBe(true);
      expect(tree.count).toBeGreaterThan(0);
    });

    it('should handle invalid path gracefully', async () => {
      const tree = projectTree('/invalid/path/that/does/not/exist');
      await tree.load();

      expect(tree.isPopulated).toBe(true);
      expect(await tree.cards()).toHaveLength(0);
    });

    it('should clear the store and reset populated state', async () => {
      const tree = await loadedTree();

      expect(tree.isPopulated).toBe(true);
      expect(tree.count).toBeGreaterThan(0);

      tree.clear();
      expect(tree.isPopulated).toBe(false);
    });
  });

  describe('accessing a card', () => {
    let tree: CardTree;
    let template: CardTree;

    beforeAll(async () => {
      await createFixture();
      ({ tree, template } = await loadedTrees());
    });
    afterAll(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('should retrieve existing card', async () => {
      const card = await tree.card('test_1');
      expect(card.key).toBe('test_1');
      expect(card.metadata!.title).toBe('Root Card');
    });

    it('should throw for non-existing card', async () => {
      await expect(tree.card('non_existing_card')).rejects.toThrow(
        CardNotFoundError,
      );
      expect(tree.has('non_existing_card')).toBe(false);
    });

    it('should check if card exists', () => {
      expect(tree.has('test_1')).toBe(true);
      expect(tree.has('non_existing_card')).toBe(false);
    });

    it('derives a card path from its position in the tree', () => {
      expect(tree.pathOf('test_1')).toBe(join(testCardsPath, 'test_1'));
      expect(tree.pathOf('test_2')).toBe(
        join(testCardsPath, 'test_1', 'c', 'test_2'),
      );
      expect(template.pathOf('test_9')).toBe(
        join(testTemplateCardsPath, 'test_9'),
      );
    });

    it('derives an attachment path from its card', () => {
      const attachments = tree.attachmentsOf('test_1');
      expect(attachments).toHaveLength(1);
      expect(attachments[0].card).toBe('test_1');
      expect(attachments[0].fileName).toBe('test-attachment.txt');
      expect(attachments[0].path).toBe(join(testCardsPath, 'test_1', 'a'));
      expect(attachments[0].mimeType).toBe('text/plain');
    });
  });

  describe('accessing cards', () => {
    let tree: CardTree;
    let template: CardTree;
    let keys: CardKeyRegistry;

    beforeAll(async () => {
      await createFixture();
      ({ tree, template, keys } = await loadedTrees());
    });
    afterAll(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('should return all cards', async () => {
      const cards = await tree.cards();

      expect(cards).toBeInstanceOf(Array);
      expect(cards.length).toBeGreaterThan(0);
      expect(cards).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: 'test_1' }),
          expect.objectContaining({ key: 'test_2' }),
          expect.objectContaining({ key: 'test_3' }),
        ]),
      );
    });

    it('should return only template cards', async () => {
      expect((await template.cards()).map((card) => card.key)).toEqual([
        'test_9',
      ]);
      // Each card belongs to exactly one tree, and the registry knows which.
      expect(keys.ownerOf('test_9')).toBe(template);
      expect(keys.ownerOf('test_1')).toBe(tree);
    });

    it('should return the cards of one container', () => {
      expect(tree.keys()).toEqual(['test_1', 'test_2', 'test_3']);
      expect(template.keys()).toEqual(['test_9']);
      expect(template.count).toBe(1);
    });
  });

  describe('store updates', () => {
    let tree: CardTree;
    let template: CardTree;

    beforeAll(async () => {
      await createFixture();
      ({ tree, template } = await loadedTrees());
    });
    afterAll(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('should update existing card', async () => {
      const original = await tree.card('test_1');
      original.metadata!.title = 'Updated Title';

      await tree.writeMetadata(original);

      expect((await tree.card('test_1')).metadata!.title).toBe('Updated Title');
    });

    it('should add new card if it does not exist', async () => {
      const newCardKey = 'test_new';
      expect(tree.has(newCardKey)).toBe(false);

      tree.insert({
        key: newCardKey,
        path: join(testCardsPath, newCardKey),
        parent: 'root',
        children: [],
        attachments: [],
        metadata: {
          title: 'New Card',
          cardType: 'test/cardTypes/page',
          workflowState: 'Draft',
          rank: '1',
          links: [],
        },
      });

      expect(tree.has(newCardKey)).toBe(true);
      expect((await tree.card(newCardKey)).metadata!.title).toBe('New Card');
      // Inserted at the location's root, so its folder is the root's.
      expect(tree.pathOf(newCardKey)).toBe(join(testCardsPath, newCardKey));
    });

    it('should update card content for existing card', async () => {
      const newContent = 'Updated content for test_1';
      const card = await tree.card('test_1');

      expect(await tree.writeContent({ ...card, content: newContent })).toBe(
        true,
      );
      expect(await tree.content('test_1')).toBe(newContent);
    });

    it('should update card metadata for existing card', async () => {
      const newMetadata: CardMetadata = {
        title: 'Updated Metadata Title',
        cardType: 'test/cardTypes/updated',
        workflowState: 'Published',
        rank: '5',
        links: [],
      };

      expect(
        await tree.writeMetadata({
          ...(await tree.card('test_1')),
          metadata: newMetadata,
        }),
      ).toBe(true);
      const updated = await tree.card('test_1');
      expect(updated.metadata!.title).toBe('Updated Metadata Title');
      expect(updated.metadata!.workflowState).toBe('Published');
    });

    it('relocating a card moves its whole subtree with it', async () => {
      // test_2 and test_3 are children of test_1; move test_2 under test_3.
      tree.relocate('test_2', 'test_3');

      expect(tree.childrenOf('test_1')).toEqual(['test_3']);
      expect(tree.childrenOf('test_3')).toEqual(['test_2']);
      expect(tree.pathOf('test_2')).toBe(
        join(testCardsPath, 'test_1', 'c', 'test_3', 'c', 'test_2'),
      );
      // Attachments follow the card without being rewritten.
      await tree.addAttachment('test_2', 'moved.txt', Buffer.from('moved'));
      expect(tree.attachmentsOf('test_2')[0].path).toBe(
        join(tree.pathOf('test_2'), 'a'),
      );
    });

    it('moving a card to another tree takes its descendants along', () => {
      template.graft(tree.uproot('test_1'), 'root');

      for (const cardKey of ['test_1', 'test_2', 'test_3']) {
        expect(tree.has(cardKey)).toBe(false);
        expect(template.has(cardKey)).toBe(true);
      }
      // The subtree keeps its shape, and its paths are rederived from the
      // destination's root.
      expect(template.pathOf('test_3')).toBe(
        join(testTemplateCardsPath, 'test_1', 'c', 'test_3'),
      );
      expect(template.pathOf('test_2')).toBe(
        join(testTemplateCardsPath, 'test_1', 'c', 'test_3', 'c', 'test_2'),
      );
    });

    it('a read-only tree refuses writes', async () => {
      const keys = new CardKeyRegistry(() => 'test');
      const module = templateTree(
        'mod/templates/page',
        testTemplateCardsPath,
        keys,
        false,
      );
      await module.load();

      expect(() => module.relocate('test_9', 'root')).toThrow(
        'Cannot modify imported module',
      );
      await expect(module.deleteSubtree('test_9')).rejects.toThrow(
        'Cannot modify imported module',
      );
      await expect(
        module.writeMetadata(await module.card('test_9')),
      ).rejects.toThrow('Cannot modify imported module');
    });
  });

  describe('Removing data from the store', () => {
    let tree: CardTree;

    beforeAll(async () => {
      await createFixture();
      tree = await loadedTree();
    });
    afterAll(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('should delete existing card', async () => {
      expect(tree.has('test_2')).toBe(true);

      expect(await tree.deleteSubtree('test_2')).toBe(true);

      expect(tree.has('test_2')).toBe(false);
    });

    it('should return false for non-existing card', async () => {
      expect(await tree.deleteSubtree('non_existing_card')).toBe(false);
    });

    it('deleting a subtree deletes the folders too', async () => {
      const path = tree.pathOf('test_1');
      expect(existsSync(path)).toBe(true);

      expect(await tree.deleteSubtree('test_1')).toBe(true);

      expect(tree.has('test_1')).toBe(false);
      expect(tree.has('test_3')).toBe(false);
      expect(existsSync(path)).toBe(false);
    });
  });

  describe('attachment methods', () => {
    let tree: CardTree;

    beforeAll(async () => {
      await createFixture();
      tree = await loadedTree();
    });
    afterAll(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('should return attachments for existing card', () => {
      expect(tree.attachmentsOf('test_1')).toBeInstanceOf(Array);
    });

    it('should throw for non-existing card', () => {
      expect(() => tree.attachmentsOf('non_existing_card')).toThrow(
        CardNotFoundError,
      );
    });

    it('should add attachment to existing card', async () => {
      const fileName = 'new-attachment.pdf';

      await tree.addAttachment('test_1', fileName, Buffer.from('a pdf'));
      expect(
        tree.attachmentsOf('test_1').some((a) => a.fileName === fileName),
      ).toBe(true);
    });

    it('should remove attachment from existing card', async () => {
      const fileName = 'to-be-deleted.txt';
      const has = () =>
        tree.attachmentsOf('test_1').some((a) => a.fileName === fileName);

      await tree.addAttachment('test_1', fileName, Buffer.from('bye'));
      expect(has()).toBe(true);

      await tree.removeAttachment('test_1', fileName);
      expect(has()).toBe(false);
    });
  });

  // Store-level invariants that the tree's surface cannot express. For a card
  // it does not hold, CardTree throws CardNotFoundError before the store ever
  // gets to answer, and CardTree.addAttachment writes the file with the 'wx'
  // flag, so a duplicate fails at the filesystem rather than reaching the
  // store at all. CardStore is an exported class of its own, so these
  // construct one directly rather than reaching into a tree's internals.
  describe('CardStore', () => {
    // A store holding one card, built without touching the filesystem.
    function storeWithCard(): CardStore {
      const store = new CardStore(testCardsPath);
      store.put({
        key: 'test_1',
        parent: 'root',
        contentRead: true,
        metadata: {
          title: 'Card',
          cardType: 'test/cardTypes/page',
          workflowState: 'Draft',
          rank: '1',
          links: [],
        },
        content: 'content',
        attachments: [],
      });
      return store;
    }

    it('holds no entry for a card it was never given', () => {
      const store = storeWithCard();
      expect(store.hasCard('test_1')).toBe(true);
      expect(store.getCard('non_existing_card')).toBeUndefined();
    });

    it('content update returns false for non-existing card', () => {
      expect(
        storeWithCard().updateCardContent('non_existing_card', 'some content'),
      ).toBe(false);
    });

    it('metadata update returns false for non-existing card', () => {
      const metadata: CardMetadata = {
        title: 'Some title',
        cardType: 'some/type',
        workflowState: 'Draft',
        rank: '1',
        links: [],
      };

      expect(
        storeWithCard().updateCardMetadata('non_existing_card', metadata),
      ).toBe(false);
    });

    it('should not add duplicate attachment', () => {
      const fileName = 'duplicate.txt';
      const store = storeWithCard();

      expect(store.addAttachment('test_1', fileName)).toBe(true);
      expect(store.addAttachment('test_1', fileName)).toBe(false);

      const duplicateCount = store
        .getCard('test_1')!
        .attachments.filter((a) => a.fileName === fileName).length;
      expect(duplicateCount).toBe(1);
    });

    it('adding to a non-existing card returns false', () => {
      expect(
        storeWithCard().addAttachment('non_existing_card', 'file.txt'),
      ).toBe(false);
    });

    it('should return false when trying to delete non-existing attachment', () => {
      expect(
        storeWithCard().deleteAttachment(
          'test_1',
          'non_existing_attachment.txt',
        ),
      ).toBe(false);
    });

    it('deleting from a non-existing card returns false', () => {
      expect(
        storeWithCard().deleteAttachment('non_existing_card', 'file.txt'),
      ).toBe(false);
    });
  });

  describe('population', () => {
    let tree: CardTree;

    beforeAll(async () => {
      await createFixture();
      tree = await loadedTree();
    });
    afterAll(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('should throw error with file path when index.json has invalid JSON', async () => {
      const invalidCardKey = 'test_invalid';
      const invalidCardPath = join(testCardsPath, invalidCardKey);
      mkdirSync(invalidCardPath, { recursive: true });

      // Create a card with invalid JSON in index.json
      writeFileSync(
        join(invalidCardPath, 'index.json'),
        '{ "title": "Invalid Card", "cardType": "test/cardTypes/page", invalid json }',
      );
      writeFileSync(join(invalidCardPath, 'index.adoc'), 'Content');

      const newTree = projectTree(testCardsPath);
      await expect(newTree.load()).rejects.toThrow(
        `Invalid JSON in file '${join(invalidCardPath, 'index.json')}'`,
      );

      rmSync(invalidCardPath, { recursive: true, force: true });
    });

    it('should populate parent-child relationships', async () => {
      const parentCard = await tree.card('test_1');
      expect(parentCard.children).toHaveLength(2);
      expect(parentCard.children).toContain('test_2');
      expect(parentCard.children).toContain('test_3');
      // The card's children mirror the adjacency index.
      expect(tree.childrenOf('test_1')).toEqual(parentCard.children);
      // And a child names its parent, taken from where its folder sits.
      expect((await tree.card('test_2')).parent).toBe('test_1');
      expect((await tree.card('test_1')).parent).toBe('root');
    });

    it('should return correct population status', async () => {
      const fresh = projectTree(testCardsPath);

      expect(fresh.isPopulated).toBe(false);

      await fresh.load();
      expect(fresh.isPopulated).toBe(true);

      fresh.clear();
      expect(fresh.isPopulated).toBe(false);
    });

    it('writeMetadata throws when the metadata file cannot be written', async () => {
      // A directory where index.json belongs is an unwritable target for any
      // user, root included.
      const card = await tree.card('test_3');
      rmSync(join(tree.pathOf('test_3'), 'index.json'));
      mkdirSync(join(tree.pathOf('test_3'), 'index.json'), {
        recursive: true,
      });

      await expect(tree.writeMetadata(card)).rejects.toThrow(/EISDIR/);
    });
  });

  describe('index consistency', async () => {
    // The containers the randomized sequence spreads cards over: the project,
    // plus two templates. Each is its own tree, and they share one key
    // registry — which is what keeps card keys unique across all of them.
    const treeNames = ['project', 'alpha', 'beta'];

    // Recomputes the adjacency index from scratch, the way the store's deleted
    // full-rebuild pass did: read the cards in store order and group them.
    function recompute(cards: Card[]) {
      const children = new Map<string, string[]>();
      for (const card of cards) {
        if (card.parent) {
          const siblings = children.get(card.parent) ?? [];
          siblings.push(card.key);
          children.set(card.parent, siblings);
        }
      }
      return children;
    }

    // Compares the whole shape of the index in one assertion, so a mismatch
    // reports contents *and* order.
    async function assertIndexMatchesRecomputation(
      tree: CardTree,
      step: string,
    ) {
      const cards = await tree.cards();
      const children = recompute(cards);

      const parentKeys = [
        ...new Set([...children.keys(), ...cards.map((card) => card.key)]),
      ].sort();
      const indexedChildren: Record<string, string[]> = {};
      const expectedChildren: Record<string, string[]> = {};
      for (const parentKey of parentKeys) {
        indexedChildren[parentKey] = tree.childrenOf(parentKey);
        expectedChildren[parentKey] = children.get(parentKey) ?? [];
      }
      expect(
        indexedChildren,
        `${step}: children index of ${tree.name}`,
      ).toEqual(expectedChildren);

      // Each card's own 'children' field mirrors the index.
      for (const card of cards) {
        expect(
          card.children,
          `${step}: children of ${card.key} in ${tree.name}`,
        ).toEqual(expectedChildren[card.key]);
      }
    }

    // Every key is owned by exactly the tree that holds it. This is the
    // invariant that replaced the merged store's location index.
    function assertOwnershipMatches(
      trees: CardTree[],
      keys: CardKeyRegistry,
      step: string,
    ) {
      const owners = new Map<string, CardTree>();
      for (const tree of trees) {
        for (const cardKey of tree.keys()) {
          expect(
            owners.has(cardKey),
            `${step}: ${cardKey} is in two trees`,
          ).toBe(false);
          owners.set(cardKey, tree);
        }
      }
      expect([...keys.inUse()].sort(), `${step}: keys in use`).toEqual(
        [...owners.keys()].sort(),
      );
      for (const [cardKey, tree] of owners) {
        expect(keys.ownerOf(cardKey), `${step}: owner of ${cardKey}`).toBe(
          tree,
        );
      }
    }

    // Deterministic PRNG so a failing sequence is reproducible.
    function random(seed: number) {
      let state = seed;
      return () => {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

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

    it('the indexes match a from-scratch recomputation after a randomized op sequence', async () => {
      const keyNames = Array.from(
        { length: 24 },
        (_, index) => `test_${index}`,
      );
      const counts = { add: 0, reparent: 0, move: 0, remove: 0 };

      for (const seed of [1, 7, 42, 1337]) {
        const next = random(seed);
        const pick = <T>(items: T[]) =>
          items[Math.floor(next() * items.length)];
        const keys = new CardKeyRegistry(() => 'test');
        const trees = treeNames.map((name) =>
          name === 'project'
            ? projectTree(testCardsPath, keys)
            : templateTree(`test/templates/${name}`, testCardsPath, keys),
        );

        // Candidate parents exclude the card and its descendants: a tree does
        // not stop a caller from making a cycle (the command layer
        // pre-validates that), and a cycle would make 'the path of a card'
        // meaningless.
        const subtreeOf = (tree: CardTree, cardKey: string): string[] => [
          cardKey,
          ...tree
            .childrenOf(cardKey)
            .flatMap((childKey) => subtreeOf(tree, childKey)),
        ];

        for (let step = 0; step < 250; step++) {
          const present = trees.flatMap((tree) => tree.keys());
          const absent = keyNames.filter((key) => !present.includes(key));
          // Candidate parents within a tree: its own cards, or the root.
          const parentsIn = (tree: CardTree) => [...tree.keys(), 'root'];
          const roll = next();
          const label = `seed ${seed} step ${step}`;

          if (absent.length > 0 && (roll < 0.45 || present.length === 0)) {
            const tree = pick(trees);
            tree.insert(cardAt(pick(absent), pick(parentsIn(tree))));
            counts.add++;
          } else if (roll < 0.7) {
            // Re-parent inside the card's own tree.
            const cardKey = pick(present);
            const tree = keys.ownerOf(cardKey)!;
            const subtree = subtreeOf(tree, cardKey);
            tree.relocate(
              cardKey,
              pick(parentsIn(tree).filter((item) => !subtree.includes(item))),
            );
            counts.reparent++;
          } else if (roll < 0.85) {
            // Move a card and its descendants into another tree.
            const cardKey = pick(present);
            const source = keys.ownerOf(cardKey)!;
            const destination = pick(trees);
            const uprooted = source.uproot(cardKey);
            destination.graft(
              uprooted,
              pick(
                parentsIn(destination).filter(
                  (item) => !uprooted.some((card) => card.key === item),
                ),
              ),
            );
            counts.move++;
          } else {
            const cardKey = pick(present);
            const tree = keys.ownerOf(cardKey)!;
            tree.uproot(cardKey);
            counts.remove++;
          }

          for (const tree of trees) {
            await assertIndexMatchesRecomputation(tree, label);
          }
          assertOwnershipMatches(trees, keys, label);
        }

        // The sequence must have produced real nesting and used more than one
        // tree, or it would not exercise either invariant.
        const cards = (
          await Promise.all(trees.map((tree) => tree.cards()))
        ).flat();
        expect(
          cards.filter((card) => card.parent && card.parent !== 'root').length,
        ).toBeGreaterThan(0);
        expect(trees.filter((tree) => tree.count > 0).length).toBeGreaterThan(
          1,
        );
      }

      // Guard against a roll distribution that stops exercising an operation.
      expect(Math.min(...Object.values(counts))).toBeGreaterThan(0);
    });
  });

  describe('Template and module operations', () => {
    const tempDir = join(baseDir, 'tmp-card-store-tests');
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

    it('should create new template, add cards, and verify cards in the store', async () => {
      const name = 'decision/templates/testTemplate';
      const templateResource = commands.project.resources.byType(
        name,
        'templates',
      );
      await templateResource.create();
      commands.project.resources.changed();
      await templateResource.addCard('decision/cardTypes/decision');
      await templateResource.addCard('decision/cardTypes/simplepage');

      // Verify cards from template are in the store
      const templateCards = await templateResource.templateCards();
      expect(templateCards.length).toBe(2);

      // Check that template cards exist in the project's tree
      for (const templateCard of templateCards) {
        expect(commands.project.hasCard(templateCard.key)).toBe(true);
        const storedCard = await commands.project.findCard(templateCard.key);
        expect(storedCard).toBeDefined();
        expect(storedCard!.key).toBe(templateCard.key);
      }
    });

    it('should remove template and verify cards are gone from the store', async () => {
      const name = 'decision/templates/testTemplate';
      const templateResource = commands.project.resources.byType(
        name,
        'templates',
      );
      await templateResource.create();
      commands.project.resources.changed();

      const template = commands.project.resources.byType(name, 'templates');
      await template.addCard('decision/cardTypes/decision');

      const templateCards = await template.templateCards();
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

    it('should import base module and verify template cards in the store', async () => {
      const baseModule = 'https://github.com/CyberismoCom/module-base.git';
      await commands.importCmd.importModule(baseModule);

      const allTemplateCards = await commands.project.allTemplateCards();
      const baseTemplateCards = allTemplateCards.filter((card: Card) =>
        card.path.includes(`base${sep}templates`),
      );

      expect(baseTemplateCards.length).toBeGreaterThan(0);
      for (const templateCard of baseTemplateCards) {
        expect(commands.project.hasCard(templateCard.key)).toBe(true);
        const storedCard = await commands.project.findCard(templateCard.key);
        expect(storedCard).toBeDefined();
        expect(storedCard!.key).toBe(templateCard.key);
      }
    }, 60000);

    it('should remove base module and verify template cards are gone from the store', async () => {
      const baseModule = 'https://github.com/CyberismoCom/module-base.git';

      await commands.importCmd.importModule(baseModule);

      const allTemplateCards = await commands.project.allTemplateCards();
      const baseTemplateCards = allTemplateCards.filter((card: Card) =>
        card.path.includes(`base${sep}templates`),
      );

      // Verify that module template cards are in the store
      expect(baseTemplateCards.length).toBeGreaterThan(0);
      for (const templateCard of baseTemplateCards) {
        expect(commands.project.hasCard(templateCard.key)).toBe(true);
        const storedCard = await commands.project.findCard(templateCard.key);
        expect(storedCard).toBeDefined();
        expect(storedCard!.key).toBe(templateCard.key);
      }

      // Get the imported module name
      const moduleEntry = commands.project.configuration.modules.find(
        (m) => m.location && m.location.includes('module-base'),
      );
      expect(moduleEntry).toBeDefined();

      // Remove module
      await commands.removeCmd.remove('module', moduleEntry!.name);

      // Verify module template cards are gone from the store after removal
      const remainingTemplateCards = (
        await commands.project.allTemplateCards()
      ).filter((card: Card) => card.path.includes(`base${sep}templates`));

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

    const cardMetadata = {
      title: 'Card',
      cardType: 'test/cardTypes/page',
      workflowState: 'Draft',
      rank: '1',
    } as CardMetadata;

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
      const template = templateTree(
        'test/templates/dup',
        dupTemplatePath,
        keys,
      );
      await tree.load();
      expect(await tree.content('test_1')).toBe('project card');

      // The template's tree carries a key the project's tree already claimed.
      await expect(template.load()).rejects.toThrow(DuplicateCardKeyError);

      // The card that was there first must not have been overwritten.
      expect(await tree.content('test_1')).toBe('project card');
    });

    it('rejects a key duplicated inside one populate batch', async () => {
      createTestCard('test_1', dupCardsPath, cardMetadata, 'root card');
      createTestCard('test_2', dupCardsPath, cardMetadata, 'other root card');
      const nested = join(dupCardsPath, 'test_2', 'c');
      mkdirSync(nested, { recursive: true });
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
      // 'decision_5' is a project card in this fixture; give the simplepage
      // template a card of the same key.
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
