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

const TEMPLATE_LOCATION = 'test/templates/test';

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

  // A tree over the fixture above, with both of its locations loaded.
  async function loadedTree(): Promise<CardTree> {
    const tree = new CardTree(testCardsPath);
    await tree.load(testCardsPath, 'project');
    await tree.load(testTemplateCardsPath, TEMPLATE_LOCATION);
    return tree;
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
      const tree = new CardTree(testCardsPath);
      expect(tree).toBeInstanceOf(CardTree);
      expect(tree.isPopulated).toBe(false);
    });

    it('should populate the store from a filesystem path', async () => {
      const tree = new CardTree(testCardsPath);
      expect(tree.isPopulated).toBe(false);
      await tree.load(testCardsPath, 'project');

      expect(tree.isPopulated).toBe(true);
      expect(tree.store.getCards().length).toBeGreaterThan(0);
    });

    it('should handle invalid path gracefully', async () => {
      const tree = new CardTree(testCardsPath);
      await tree.load('/invalid/path/that/does/not/exist', 'project');

      expect(tree.isPopulated).toBe(true);
      expect(tree.store.getCards()).toHaveLength(0);
    });

    it('should clear the store and reset populated state', async () => {
      const tree = await loadedTree();

      expect(tree.isPopulated).toBe(true);
      expect(tree.store.getCards().length).toBeGreaterThan(0);

      tree.clear();
      expect(tree.isPopulated).toBe(false);
    });
  });

  describe('accessing a card', () => {
    let tree: CardTree;

    beforeAll(async () => {
      await createFixture();
      tree = await loadedTree();
    });
    afterAll(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('should retrieve existing card', () => {
      const card = tree.card('test_1');
      expect(card.key).toBe('test_1');
      expect(card.metadata!.title).toBe('Root Card');
    });

    it('should throw for non-existing card', () => {
      expect(() => tree.card('non_existing_card')).toThrow(CardNotFoundError);
      expect(tree.store.getCard('non_existing_card')).toBeUndefined();
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
      expect(tree.pathOf('test_9')).toBe(join(testTemplateCardsPath, 'test_9'));
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

    beforeAll(async () => {
      await createFixture();
      tree = await loadedTree();
    });
    afterAll(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('should return all cards', () => {
      const cards = tree.store.getCards();

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

    it('should return only template cards', () => {
      const templateCards = tree.allTemplateCards();
      expect(templateCards.map((card) => card.key)).toEqual(['test_9']);
      for (const card of templateCards) {
        expect(tree.locationOfCard(card.key)).not.toBe('project');
      }
    });

    it('should return the cards of one location', () => {
      expect(tree.cardKeysIn('project')).toEqual([
        'test_1',
        'test_2',
        'test_3',
      ]);
      expect(tree.cardKeysIn(TEMPLATE_LOCATION)).toEqual(['test_9']);
      expect(tree.cardCountIn(TEMPLATE_LOCATION)).toBe(1);
    });
  });

  describe('store updates', () => {
    let tree: CardTree;

    beforeAll(async () => {
      await createFixture();
      tree = await loadedTree();
    });
    afterAll(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('should update existing card', () => {
      const original = tree.card('test_1');

      tree.store.updateCardMetadata('test_1', {
        ...original.metadata!,
        title: 'Updated Title',
      });

      expect(tree.card('test_1').metadata!.title).toBe('Updated Title');
    });

    it('should add new card if it does not exist', () => {
      const newCardKey = 'test_new';
      expect(tree.has(newCardKey)).toBe(false);

      tree.insert(
        {
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
        },
        'project',
      );

      expect(tree.has(newCardKey)).toBe(true);
      expect(tree.card(newCardKey).metadata!.title).toBe('New Card');
      // Inserted at the location's root, so its folder is the root's.
      expect(tree.pathOf(newCardKey)).toBe(join(testCardsPath, newCardKey));
    });

    it('should update card content for existing card', () => {
      const newContent = 'Updated content for test_1';

      expect(tree.store.updateCardContent('test_1', newContent)).toBe(true);
      expect(tree.content('test_1')).toBe(newContent);
    });

    it('content update returns false for non-existing card', () => {
      expect(
        tree.store.updateCardContent('non_existing_card', 'some content'),
      ).toBe(false);
    });

    it('should update card metadata for existing card', () => {
      const newMetadata: CardMetadata = {
        title: 'Updated Metadata Title',
        cardType: 'test/cardTypes/updated',
        workflowState: 'Published',
        rank: '5',
        links: [],
      };

      expect(tree.store.updateCardMetadata('test_1', newMetadata)).toBe(true);
      const updated = tree.card('test_1');
      expect(updated.metadata!.title).toBe('Updated Metadata Title');
      expect(updated.metadata!.workflowState).toBe('Published');
    });

    it('metadata update returns false for non-existing card', () => {
      const metadata: CardMetadata = {
        title: 'Some title',
        cardType: 'some/type',
        workflowState: 'Draft',
        rank: '1',
        links: [],
      };

      expect(tree.store.updateCardMetadata('non_existing_card', metadata)).toBe(
        false,
      );
    });

    it('relocating a card moves its whole subtree with it', () => {
      // test_2 and test_3 are children of test_1; move test_2 under test_3.
      tree.relocate('test_2', 'test_3');

      expect(tree.childrenOf('test_1')).toEqual(['test_3']);
      expect(tree.childrenOf('test_3')).toEqual(['test_2']);
      expect(tree.pathOf('test_2')).toBe(
        join(testCardsPath, 'test_1', 'c', 'test_3', 'c', 'test_2'),
      );
      // Attachments follow the card without being rewritten.
      tree.store.addAttachment('test_2', 'moved.txt');
      expect(tree.attachmentsOf('test_2')[0].path).toBe(
        join(tree.pathOf('test_2'), 'a'),
      );
    });

    it('relocating a card into another location takes its descendants along', () => {
      tree.relocate('test_1', 'root', TEMPLATE_LOCATION);

      for (const cardKey of ['test_1', 'test_2', 'test_3']) {
        expect(tree.locationOfCard(cardKey)).toBe(TEMPLATE_LOCATION);
      }
      expect(tree.pathOf('test_3')).toBe(
        join(testTemplateCardsPath, 'test_1', 'c', 'test_3'),
      );
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

    it('should delete existing card', () => {
      expect(tree.has('test_2')).toBe(true);

      expect(tree.store.deleteCard('test_2')).toBe(true);

      expect(tree.has('test_2')).toBe(false);
    });

    it('should return false for non-existing card', () => {
      expect(tree.store.deleteCard('non_existing_card')).toBe(false);
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

    it('should add attachment to existing card', () => {
      const fileName = 'new-attachment.pdf';

      expect(tree.store.addAttachment('test_1', fileName)).toBe(true);
      expect(
        tree.attachmentsOf('test_1').some((a) => a.fileName === fileName),
      ).toBe(true);
    });

    it('should not add duplicate attachment', () => {
      const fileName = 'duplicate.txt';

      expect(tree.store.addAttachment('test_1', fileName)).toBe(true);
      expect(tree.store.addAttachment('test_1', fileName)).toBe(false);

      const duplicateCount = tree
        .attachmentsOf('test_1')
        .filter((a) => a.fileName === fileName).length;
      expect(duplicateCount).toBe(1);
    });

    it('adding to a non-existing card returns false', () => {
      expect(tree.store.addAttachment('non_existing_card', 'file.txt')).toBe(
        false,
      );
    });

    it('should remove attachment from existing card', () => {
      const fileName = 'to-be-deleted.txt';
      const has = () =>
        tree.attachmentsOf('test_1').some((a) => a.fileName === fileName);

      tree.store.addAttachment('test_1', fileName);
      expect(has()).toBe(true);

      expect(tree.store.deleteAttachment('test_1', fileName)).toBe(true);
      expect(has()).toBe(false);
    });

    it('should return false when trying to delete non-existing attachment', () => {
      expect(
        tree.store.deleteAttachment('test_1', 'non_existing_attachment.txt'),
      ).toBe(false);
    });

    it('deleting from a non-existing card returns false', () => {
      expect(tree.store.deleteAttachment('non_existing_card', 'file.txt')).toBe(
        false,
      );
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

      const newTree = new CardTree(testCardsPath);
      await expect(newTree.load(testCardsPath, 'project')).rejects.toThrow(
        `Invalid JSON in file '${join(invalidCardPath, 'index.json')}'`,
      );

      rmSync(invalidCardPath, { recursive: true, force: true });
    });

    it('should populate parent-child relationships', () => {
      const parentCard = tree.card('test_1');
      expect(parentCard.children).toHaveLength(2);
      expect(parentCard.children).toContain('test_2');
      expect(parentCard.children).toContain('test_3');
      // The card's children mirror the adjacency index.
      expect(tree.childrenOf('test_1')).toEqual(parentCard.children);
      // And a child names its parent, taken from where its folder sits.
      expect(tree.card('test_2').parent).toBe('test_1');
      expect(tree.card('test_1').parent).toBe('root');
    });

    it('should return correct population status', async () => {
      const fresh = new CardTree(testCardsPath);

      expect(fresh.isPopulated).toBe(false);

      await fresh.load(testCardsPath, 'project');
      expect(fresh.isPopulated).toBe(true);

      fresh.clear();
      expect(fresh.isPopulated).toBe(false);
    });

    it('writeMetadata throws when the metadata file cannot be written', async () => {
      // A directory where index.json belongs is an unwritable target for any
      // user, root included.
      const card = tree.card('test_3');
      rmSync(join(tree.pathOf('test_3'), 'index.json'));
      mkdirSync(join(tree.pathOf('test_3'), 'index.json'), {
        recursive: true,
      });

      await expect(tree.writeMetadata(card)).rejects.toThrow(/EISDIR/);
    });
  });

  describe('index consistency', () => {
    // Locations the randomized sequence spreads cards over: the project, plus
    // two templates.
    const locationNames = ['project', 'alpha', 'beta'];

    function expectedLocation(location: string): string {
      return location === 'project' ? 'project' : `test/templates/${location}`;
    }

    // Recomputes both indexes from scratch, the way the store's deleted
    // full-rebuild pass and its deleted per-call location filters did: read the
    // cards in store order and group them.
    function recompute(cards: ReturnType<CardTree['store']['getCards']>) {
      const children = new Map<string, string[]>();
      const byLocation = new Map<string, string[]>();
      for (const card of cards) {
        if (card.parent) {
          const siblings = children.get(card.parent) ?? [];
          siblings.push(card.key);
          children.set(card.parent, siblings);
        }
        const inLocation = byLocation.get(card.location) ?? [];
        inLocation.push(card.key);
        byLocation.set(card.location, inLocation);
      }
      return { children, byLocation };
    }

    // Compares the whole shape of each index in one assertion, so a mismatch
    // reports contents *and* order.
    function assertIndexesMatchRecomputation(tree: CardTree, step: string) {
      const store = tree.store;
      const cards = store.getCards();
      const { children, byLocation } = recompute(cards);

      const parentKeys = [
        ...new Set([...children.keys(), ...cards.map((card) => card.key)]),
      ].sort();
      const indexedChildren: Record<string, string[]> = {};
      const expectedChildren: Record<string, string[]> = {};
      for (const parentKey of parentKeys) {
        indexedChildren[parentKey] = store.childrenOf(parentKey);
        expectedChildren[parentKey] = children.get(parentKey) ?? [];
      }
      expect(indexedChildren, `${step}: children index`).toEqual(
        expectedChildren,
      );

      // Each card's own 'children' field mirrors the index.
      for (const card of cards) {
        expect(card.children, `${step}: children of ${card.key}`).toEqual(
          expectedChildren[card.key],
        );
      }

      const locationKeys = [
        ...new Set([
          ...byLocation.keys(),
          ...locationNames.map(expectedLocation),
        ]),
      ].sort();
      const indexedLocations: Record<string, string[]> = {};
      const expectedLocations: Record<string, string[]> = {};
      for (const location of locationKeys) {
        indexedLocations[location] = store.keysAtLocation(location);
        expectedLocations[location] = byLocation.get(location) ?? [];
      }
      expect(indexedLocations, `${step}: location index`).toEqual(
        expectedLocations,
      );

      for (const location of locationKeys) {
        expect(
          store.cardsAtLocation(location).map((card) => card.key),
          `${step}: cards at ${location}`,
        ).toEqual(expectedLocations[location]);
        expect(
          store.cardCountAtLocation(location),
          `${step}: count at ${location}`,
        ).toBe(expectedLocations[location].length);
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

    it('both indexes match a from-scratch recomputation after a randomized op sequence', () => {
      const keys = Array.from({ length: 24 }, (_, index) => `test_${index}`);
      const counts = { add: 0, reparent: 0, relocate: 0, remove: 0 };

      for (const seed of [1, 7, 42, 1337]) {
        const next = random(seed);
        const pick = <T>(items: T[]) =>
          items[Math.floor(next() * items.length)];
        const tree = new CardTree(testCardsPath);

        for (let step = 0; step < 250; step++) {
          const cards = tree.store.getCards();
          const present = cards.map((card) => card.key);
          const absent = keys.filter((key) => !present.includes(key));
          // Candidate parents within a location: its own cards, or the root.
          const parentsIn = (location: string) => [
            ...cards
              .filter((card) => card.location === expectedLocation(location))
              .map((card) => card.key),
            'root',
          ];
          const roll = next();
          const label = `seed ${seed} step ${step}`;

          if (absent.length > 0 && (roll < 0.45 || present.length === 0)) {
            const location = pick(locationNames);
            const key = pick(absent);
            tree.insert(
              cardAt(key, pick(parentsIn(location))),
              expectedLocation(location),
            );
            counts.add++;
          } else if (roll < 0.7) {
            // Re-parent inside the card's own location.
            const card = pick(cards);
            const location =
              locationNames.find(
                (item) => expectedLocation(item) === card.location,
              ) ?? 'project';
            tree.relocate(
              card.key,
              pick(parentsIn(location).filter((item) => item !== card.key)),
            );
            counts.reparent++;
          } else if (roll < 0.85) {
            // Relocate: a card and its descendants change location, and it
            // takes a parent from the destination.
            const card = pick(cards);
            const location = pick(locationNames);
            tree.relocate(
              card.key,
              pick(parentsIn(location).filter((item) => item !== card.key)),
              expectedLocation(location),
            );
            counts.relocate++;
          } else {
            tree.store.deleteCard(pick(present));
            counts.remove++;
          }

          assertIndexesMatchRecomputation(tree, label);
        }

        // The sequence must have produced real nesting and more than one
        // location, or it would not exercise either index.
        const cards = tree.store.getCards();
        expect(
          cards.filter((card) => card.parent && card.parent !== 'root').length,
        ).toBeGreaterThan(0);
        expect(
          new Set(cards.map((card) => card.location)).size,
        ).toBeGreaterThan(1);
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
      const template = templateResource.templateObject();
      await template.addCard('decision/cardTypes/decision');
      await template.addCard('decision/cardTypes/simplepage');

      // Verify cards from template are in the store
      const templateCards = template.cards();
      expect(templateCards.length).toBe(2);

      // Check that template cards exist in the project's tree
      for (const templateCard of templateCards) {
        expect(commands.project.hasCard(templateCard.key)).toBe(true);
        const storedCard = commands.project.findCard(templateCard.key);
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

    it('should import base module and verify template cards in the store', async () => {
      const baseModule = 'https://github.com/CyberismoCom/module-base.git';
      await commands.importCmd.importModule(baseModule);

      const allTemplateCards = commands.project.allTemplateCards();
      const baseTemplateCards = allTemplateCards.filter((card: Card) =>
        card.path.includes(`base${sep}templates`),
      );

      expect(baseTemplateCards.length).toBeGreaterThan(0);
      for (const templateCard of baseTemplateCards) {
        expect(commands.project.hasCard(templateCard.key)).toBe(true);
        const storedCard = commands.project.findCard(templateCard.key);
        expect(storedCard).toBeDefined();
        expect(storedCard!.key).toBe(templateCard.key);
      }
    }, 60000);

    it('should remove base module and verify template cards are gone from the store', async () => {
      const baseModule = 'https://github.com/CyberismoCom/module-base.git';

      await commands.importCmd.importModule(baseModule);

      const allTemplateCards = commands.project.allTemplateCards();
      const baseTemplateCards = allTemplateCards.filter((card: Card) =>
        card.path.includes(`base${sep}templates`),
      );

      // Verify that module template cards are in the store
      expect(baseTemplateCards.length).toBeGreaterThan(0);
      for (const templateCard of baseTemplateCards) {
        expect(commands.project.hasCard(templateCard.key)).toBe(true);
        const storedCard = commands.project.findCard(templateCard.key);
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

      const tree = new CardTree(dupCardsPath);
      await tree.load(dupCardsPath, 'project');
      expect(tree.content('test_1')).toBe('project card');

      // The template batch carries a key the project batch already claimed.
      await expect(
        tree.load(dupTemplatePath, 'test/templates/dup'),
      ).rejects.toThrow(DuplicateCardKeyError);

      // The card that was there first must not have been overwritten.
      expect(tree.content('test_1')).toBe('project card');
    });

    it('rejects a key duplicated inside one populate batch', async () => {
      createTestCard('test_1', dupCardsPath, cardMetadata, 'root card');
      createTestCard('test_2', dupCardsPath, cardMetadata, 'other root card');
      const nested = join(dupCardsPath, 'test_2', 'c');
      mkdirSync(nested, { recursive: true });
      createTestCard('test_1', nested, cardMetadata, 'nested card');

      const tree = new CardTree(dupCardsPath);
      await expect(tree.load(dupCardsPath, 'project')).rejects.toThrow(
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
