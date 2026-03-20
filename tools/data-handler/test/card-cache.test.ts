import {
  expect,
  it,
  describe,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';

import { copyDir } from '../src/utils/file-utils.js';
import { CardCache } from '../src/containers/project/card-cache.js';
import type {
  Card,
  CardAttachment,
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

function createTestData(testCardsPath: string, testTemplatesPath: string) {
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

  // Create template card
  createTestCard(
    'test_template_1',
    testTemplatesPath,
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

describe('Card cache', () => {
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-card-cache-tests');
  const testProjectPath = join(testDir, 'test-project');
  const testCardsPath = join(testProjectPath, 'cardRoot');
  const testTemplatesPath = join(testProjectPath, 'templates', 'test');
  const prefix = 'test';

  describe('operating card cache', () => {
    beforeAll(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data/', testDir);
      mkdirSync(testCardsPath, { recursive: true });
      mkdirSync(testTemplatesPath, { recursive: true });

      createTestData(testCardsPath, testTemplatesPath);
    });
    afterAll(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('should create CardCache instance with correct prefix', () => {
      const cache = new CardCache(prefix);
      expect(cache).toBeInstanceOf(CardCache);
      expect(cache.isPopulated).toBe(false);
    });
    it('should populate cache from filesystem path', async () => {
      const cache = new CardCache(prefix);
      expect(cache.isPopulated).toBe(false);
      await cache.populateFromPath(testProjectPath);

      expect(cache.isPopulated).toBe(true);
      const cards = cache.getCards();
      expect(cards.length).toBeGreaterThan(0);
    });

    it('should handle invalid path gracefully', async () => {
      const cache = new CardCache(prefix);
      await cache.populateFromPath('/invalid/path/that/does/not/exist');

      expect(cache.isPopulated).toBe(true);
      const cards = cache.getCards();
      expect(cards).toHaveLength(0);
    });
    it('should clear the cache and reset populated state', async () => {
      const cache = new CardCache(prefix);
      await cache.populateFromPath(testProjectPath);

      expect(cache.isPopulated).toBe(true);
      expect(cache.getCards().length).toBeGreaterThan(0);

      cache.clear();
      expect(cache.isPopulated).toBe(false);
    });
  });

  describe('accessing a card', () => {
    let cache: CardCache;

    beforeAll(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data/', testDir);
      mkdirSync(testCardsPath, { recursive: true });
      mkdirSync(testTemplatesPath, { recursive: true });

      createTestData(testCardsPath, testTemplatesPath);

      cache = new CardCache(prefix);
      await cache.populateFromPath(testProjectPath);
    });
    afterAll(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('should retrieve existing card', () => {
      const card = cache.getCard('test_1');
      expect(card!.key).toBe('test_1');
      expect(card!.metadata!.title).toBe('Root Card');
    });

    it('should return undefined for non-existing card', () => {
      const card = cache.getCard('non_existing_card');
      expect(card).toBeUndefined();
    });

    it('should check if card exists', () => {
      expect(cache.hasCard('test_1')).toBe(true);
      expect(cache.hasCard('non_existing_card')).toBe(false);
    });
  });

  describe('accessing cards', () => {
    let cache: CardCache;

    beforeAll(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data/', testDir);
      mkdirSync(testCardsPath, { recursive: true });
      mkdirSync(testTemplatesPath, { recursive: true });

      createTestData(testCardsPath, testTemplatesPath);

      cache = new CardCache(prefix);
      await cache.populateFromPath(testProjectPath);
    });
    afterAll(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('should return all cards', () => {
      const cards = cache.getCards();

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
      const templateCards = cache.getAllTemplateCards();
      expect(templateCards).toBeInstanceOf(Array);

      // Check that all returned cards are template cards (location !== 'project')
      templateCards.forEach((card) => {
        expect(card.location).not.toBe('project');
      });
    });
  });

  describe('cache updates', () => {
    let cache: CardCache;

    beforeAll(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data/', testDir);
      mkdirSync(testCardsPath, { recursive: true });
      mkdirSync(testTemplatesPath, { recursive: true });

      createTestData(testCardsPath, testTemplatesPath);

      cache = new CardCache(prefix);
      await cache.populateFromPath(testProjectPath);
    });
    afterAll(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('should update existing card', () => {
      const cardKey = 'test_1';
      const originalCard = cache.getCard(cardKey);
      expect(originalCard).toBeDefined();

      const updatedCardData: Card = {
        key: cardKey,
        path: originalCard!.path,
        children: [],
        attachments: [],
        metadata: {
          title: 'Updated Title',
          cardType: originalCard!.metadata!.cardType,
          workflowState: originalCard!.metadata!.workflowState,
          rank: originalCard!.metadata!.rank,
          links: [],
        },
      };

      cache.updateCard(cardKey, updatedCardData);

      const updatedCard = cache.getCard(cardKey);
      expect(updatedCard!.metadata!.title).toBe('Updated Title');
    });

    it('should add new card if it does not exist', () => {
      const newCardKey = 'test_new';
      const newCardPath = join(testCardsPath, newCardKey);

      expect(cache.hasCard(newCardKey)).toBe(false);

      const newCardData: Card = {
        key: newCardKey,
        path: newCardPath,
        children: [],
        attachments: [],
        metadata: {
          title: 'New Card',
          cardType: 'test/cardTypes/page',
          workflowState: 'Draft',
          rank: '1',
          links: [],
        },
      };

      cache.updateCard(newCardKey, newCardData);

      expect(cache.hasCard(newCardKey)).toBe(true);
      const addedCard = cache.getCard(newCardKey);
      expect(addedCard!.metadata!.title).toBe('New Card');
    });

    it('should update card content for existing card', () => {
      const cardKey = 'test_1';
      const newContent = 'Updated content for test_1';

      const success = cache.updateCardContent(cardKey, newContent);

      expect(success).toBe(true);
      const updatedCard = cache.getCard(cardKey);
      expect(updatedCard!.content).toBe(newContent);
    });

    it('should return false for non-existing card', () => {
      const success = cache.updateCardContent(
        'non_existing_card',
        'some content',
      );
      expect(success).toBe(false);
    });

    it('should update card metadata for existing card', () => {
      const cardKey = 'test_1';
      const newMetadata: CardMetadata = {
        title: 'Updated Metadata Title',
        cardType: 'test/cardTypes/updated',
        workflowState: 'Published',
        rank: '5',
        links: [],
      };

      const success = cache.updateCardMetadata(cardKey, newMetadata);

      expect(success).toBe(true);
      const updatedCard = cache.getCard(cardKey);
      expect(updatedCard!.metadata!.title).toBe('Updated Metadata Title');
      expect(updatedCard!.metadata!.workflowState).toBe('Published');
    });

    it('should return false for non-existing card', () => {
      const metadata: CardMetadata = {
        title: 'Some title',
        cardType: 'some/type',
        workflowState: 'Draft',
        rank: '1',
        links: [],
      };

      const success = cache.updateCardMetadata('non_existing_card', metadata);
      expect(success).toBe(false);
    });
  });

  describe('Removing data from card cache', () => {
    let cache: CardCache;

    beforeAll(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data/', testDir);
      mkdirSync(testCardsPath, { recursive: true });
      mkdirSync(testTemplatesPath, { recursive: true });

      createTestData(testCardsPath, testTemplatesPath);

      cache = new CardCache(prefix);
      await cache.populateFromPath(testProjectPath);
    });
    afterAll(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('should delete existing card', () => {
      const cardKey = 'test_2';

      expect(cache.hasCard(cardKey)).toBe(true);

      const success = cache.deleteCard(cardKey);

      expect(success).toBe(true);
      expect(cache.hasCard(cardKey)).toBe(false);
    });

    it('should return false for non-existing card', () => {
      const success = cache.deleteCard('non_existing_card');
      expect(success).toBe(false);
    });
  });

  describe('Card cache attachment methods', () => {
    let cache: CardCache;

    beforeAll(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data/', testDir);
      mkdirSync(testCardsPath, { recursive: true });
      mkdirSync(testTemplatesPath, { recursive: true });

      createTestData(testCardsPath, testTemplatesPath);

      cache = new CardCache(prefix);
      await cache.populateFromPath(testProjectPath);
    });
    afterAll(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('should return attachments for existing card', () => {
      const attachments = cache.getCardAttachments('test_1');
      expect(attachments).toBeDefined();
      expect(attachments).toBeInstanceOf(Array);
    });

    it('should return undefined for non-existing card', () => {
      const attachments = cache.getCardAttachments('non_existing_card');
      expect(attachments).toBeUndefined();
    });

    it('should add attachment to existing card', () => {
      const cardKey = 'test_1';
      const fileName = 'new-attachment.pdf';

      const success = cache.addAttachment(cardKey, fileName);

      expect(success).toBe(true);
      const attachments = cache.getCardAttachments(cardKey);
      expect(attachments!.some((a) => a.fileName === fileName)).toBe(true);
    });

    it('should not add duplicate attachment', () => {
      const cardKey = 'test_1';
      const fileName = 'duplicate.txt';

      // Add first time
      let success = cache.addAttachment(cardKey, fileName);
      expect(success).toBe(true);

      // Try to add again
      success = cache.addAttachment(cardKey, fileName);
      expect(success).toBe(false);

      // Verify only one instance exists
      const attachments = cache.getCardAttachments(cardKey);
      const duplicateCount = attachments?.filter(
        (a) => a.fileName === fileName,
      ).length;
      expect(duplicateCount).toBe(1);
    });

    it('should return false for non-existing card', () => {
      const success = cache.addAttachment('non_existing_card', 'file.txt');
      expect(success).toBe(false);
    });

    it('should remove attachment from existing card', () => {
      const cardKey = 'test_1';
      const fileName = 'to-be-deleted.txt';

      // First add an attachment
      cache.addAttachment(cardKey, fileName);
      expect(cache.hasCardAttachment(cardKey, fileName)).toBe(true);

      // Then delete it
      const success = cache.deleteAttachment(cardKey, fileName);

      expect(success).toBe(true);
      expect(cache.hasCardAttachment(cardKey, fileName)).toBe(false);
    });

    it('should return false when trying to delete non-existing attachment', () => {
      const success = cache.deleteAttachment(
        'test_1',
        'non_existing_attachment.txt',
      );
      expect(success).toBe(false);
    });

    it('should return false for non-existing card', () => {
      const success = cache.deleteAttachment('non_existing_card', 'file.txt');
      expect(success).toBe(false);
    });

    it('should check if card has specific attachment', () => {
      const cardKey = 'test_1';
      const fileName = 'check-attachment.txt';
      expect(cache.hasCardAttachment(cardKey, fileName)).toBe(false);
      cache.addAttachment(cardKey, fileName);
      expect(cache.hasCardAttachment(cardKey, fileName)).toBe(true);
    });

    it('should return false for non-existing card', () => {
      const result = cache.hasCardAttachment('non_existing_card', 'file.txt');
      expect(result).toBe(false);
    });

    it('should replace all attachments for existing card', () => {
      const cardKey = 'test_1';
      const newAttachments: CardAttachment[] = [
        {
          card: cardKey,
          path: '/some/path',
          fileName: 'attachment1.txt',
          mimeType: 'text/plain',
        },
        {
          card: cardKey,
          path: '/some/path',
          fileName: 'attachment2.pdf',
          mimeType: 'application/pdf',
        },
      ];

      const success = cache.updateCardAttachments(cardKey, newAttachments);

      expect(success).toBe(true);
      const attachments = cache.getCardAttachments(cardKey);
      expect(attachments!.length).toBe(2);
      expect(attachments!.some((a) => a.fileName === 'attachment1.txt')).toBe(
        true,
      );
      expect(attachments!.some((a) => a.fileName === 'attachment2.pdf')).toBe(
        true,
      );
    });

    it('should return false for non-existing card', () => {
      const success = cache.updateCardAttachments('non_existing_card', []);
      expect(success).toBe(false);
    });
  });

  describe('Card cache population tests', () => {
    let cache: CardCache;

    beforeAll(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data/', testDir);
      mkdirSync(testCardsPath, { recursive: true });
      mkdirSync(testTemplatesPath, { recursive: true });
      createTestData(testCardsPath, testTemplatesPath);

      cache = new CardCache(prefix);
      await cache.populateFromPath(testProjectPath);
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

      const newCache = new CardCache(prefix);
      await expect(newCache.populateFromPath(testProjectPath)).rejects.toThrow(
        `Invalid JSON in file '${join(invalidCardPath, 'index.json')}'`,
      );

      rmSync(invalidCardPath, { recursive: true, force: true });
    });

    it('should rebuild parent-child relationships', () => {
      const parentCard = cache.getCard('test_1');
      expect(parentCard).toBeDefined();
      expect(parentCard!.children).toBeInstanceOf(Array);
      const originalChildrenCount = parentCard!.children.length;

      if (parentCard) {
        parentCard.children = [];
      }
      expect(parentCard!.children.length).toBe(0);

      cache.populateChildrenRelationships();

      const updatedParentCard = cache.getCard('test_1');
      expect(updatedParentCard!.children.length).toBe(originalChildrenCount);
      expect(updatedParentCard!.children).toContain('test_2');
      expect(updatedParentCard!.children).toContain('test_3');
    });

    it('should return correct population status', async () => {
      const cache = new CardCache(prefix);

      expect(cache.isPopulated).toBe(false);

      await cache.populateFromPath(testProjectPath);
      expect(cache.isPopulated).toBe(true);

      cache.clear();
      expect(cache.isPopulated).toBe(false);
    });
  });

  describe('Template and module operations', () => {
    const tempDir = join(baseDir, 'tmp-card-cache-tests');
    let decisionProjectPath: string;
    let commands: CommandManager;

    beforeEach(async () => {
      mkdirSync(tempDir, { recursive: true });
      await copyDir('test/test-data/', tempDir);

      // Set path and create CommandManager after directory exists
      decisionProjectPath = join(tempDir, 'valid', 'decision-records');

      commands = new CommandManager(decisionProjectPath, {
        autoSaveConfiguration: false,
      });
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
      await commands.importCmd.importModule(
        baseModule,
        commands.project.basePath,
      );

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
    }, 10000);

    it('should remove base module and verify template cards are gone from the cache', async () => {
      const baseModule = 'https://github.com/CyberismoCom/module-base.git';

      await commands.importCmd.importModule(
        baseModule,
        commands.project.basePath,
      );

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
    }, 10000);
  });
});
