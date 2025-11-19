import { expect } from 'chai';

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
    before(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data/', testDir);
      mkdirSync(testCardsPath, { recursive: true });
      mkdirSync(testTemplatesPath, { recursive: true });

      createTestData(testCardsPath, testTemplatesPath);
    });
    after(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('should create CardCache instance with correct prefix', () => {
      const cache = new CardCache(prefix);
      expect(cache).to.be.instanceOf(CardCache);
      expect(cache.isPopulated).to.equal(false);
    });
    it('should populate cache from filesystem path', async () => {
      const cache = new CardCache(prefix);
      expect(cache.isPopulated).to.equal(false);
      await cache.populateFromPath(testProjectPath);

      expect(cache.isPopulated).to.equal(true);
      const cards = cache.getCards();
      expect(cards.length).to.be.greaterThan(0);
    });

    it('should handle invalid path gracefully', async () => {
      const cache = new CardCache(prefix);
      await cache.populateFromPath('/invalid/path/that/does/not/exist');

      expect(cache.isPopulated).to.equal(true);
      const cards = cache.getCards();
      expect(cards.length).to.equal(0);
    });
    it('should clear the cache and reset populated state', async () => {
      const cache = new CardCache(prefix);
      await cache.populateFromPath(testProjectPath);

      expect(cache.isPopulated).to.equal(true);
      expect(cache.getCards().length).to.be.greaterThan(0);

      cache.clear();
      expect(cache.isPopulated).to.equal(false);
    });
  });

  describe('accessing a card', () => {
    let cache: CardCache;

    before(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data/', testDir);
      mkdirSync(testCardsPath, { recursive: true });
      mkdirSync(testTemplatesPath, { recursive: true });

      createTestData(testCardsPath, testTemplatesPath);

      cache = new CardCache(prefix);
      await cache.populateFromPath(testProjectPath);
    });
    after(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('should retrieve existing card', () => {
      const card = cache.getCard('test_1');
      expect(card).to.not.equal(undefined);
      expect(card?.key).to.equal('test_1');
      expect(card?.metadata?.title).to.equal('Root Card');
    });

    it('should return undefined for non-existing card', () => {
      const card = cache.getCard('non_existing_card');
      expect(card).to.equal(undefined);
    });

    it('should check if card exists', () => {
      expect(cache.hasCard('test_1')).to.equal(true);
      expect(cache.hasCard('non_existing_card')).to.equal(false);
    });
  });

  describe('accessing cards', () => {
    let cache: CardCache;

    before(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data/', testDir);
      mkdirSync(testCardsPath, { recursive: true });
      mkdirSync(testTemplatesPath, { recursive: true });

      createTestData(testCardsPath, testTemplatesPath);

      cache = new CardCache(prefix);
      await cache.populateFromPath(testProjectPath);
    });
    after(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('should return all cards', () => {
      const cards = cache.getCards();
      expect(cards).to.be.an('array');
      expect(cards.length).to.be.greaterThan(0);

      // Check that we have our test cards
      const cardKeys = cards.map((c) => c.key);
      expect(cardKeys).to.include('test_1');
      expect(cardKeys).to.include('test_2');
      expect(cardKeys).to.include('test_3');
    });

    it('should return only template cards', () => {
      const templateCards = cache.getAllTemplateCards();
      expect(templateCards).to.be.an('array');

      // Check that all returned cards are template cards (location !== 'project')
      templateCards.forEach((card) => {
        expect(card.location).to.not.equal('project');
      });
    });
  });

  describe('cache updates', () => {
    let cache: CardCache;

    before(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data/', testDir);
      mkdirSync(testCardsPath, { recursive: true });
      mkdirSync(testTemplatesPath, { recursive: true });

      createTestData(testCardsPath, testTemplatesPath);

      cache = new CardCache(prefix);
      await cache.populateFromPath(testProjectPath);
    });
    after(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('should update existing card', () => {
      const cardKey = 'test_1';
      const originalCard = cache.getCard(cardKey);
      expect(originalCard).to.not.equal(undefined);

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
      expect(updatedCard?.metadata?.title).to.equal('Updated Title');
    });

    it('should add new card if it does not exist', () => {
      const newCardKey = 'test_new';
      const newCardPath = join(testCardsPath, newCardKey);

      expect(cache.hasCard(newCardKey)).to.equal(false);

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

      expect(cache.hasCard(newCardKey)).to.equal(true);
      const addedCard = cache.getCard(newCardKey);
      expect(addedCard?.metadata?.title).to.equal('New Card');
    });

    it('should update card content for existing card', () => {
      const cardKey = 'test_1';
      const newContent = 'Updated content for test_1';

      const success = cache.updateCardContent(cardKey, newContent);

      expect(success).to.equal(true);
      const updatedCard = cache.getCard(cardKey);
      expect(updatedCard?.content).to.equal(newContent);
    });

    it('should return false for non-existing card', () => {
      const success = cache.updateCardContent(
        'non_existing_card',
        'some content',
      );
      expect(success).to.equal(false);
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

      expect(success).to.equal(true);
      const updatedCard = cache.getCard(cardKey);
      expect(updatedCard?.metadata?.title).to.equal('Updated Metadata Title');
      expect(updatedCard?.metadata?.workflowState).to.equal('Published');
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
      expect(success).to.equal(false);
    });
  });

  describe('Removing data from card cache', () => {
    let cache: CardCache;

    before(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data/', testDir);
      mkdirSync(testCardsPath, { recursive: true });
      mkdirSync(testTemplatesPath, { recursive: true });

      createTestData(testCardsPath, testTemplatesPath);

      cache = new CardCache(prefix);
      await cache.populateFromPath(testProjectPath);
    });
    after(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('should delete existing card', () => {
      const cardKey = 'test_2';

      expect(cache.hasCard(cardKey)).to.equal(true);

      const success = cache.deleteCard(cardKey);

      expect(success).to.equal(true);
      expect(cache.hasCard(cardKey)).to.equal(false);
    });

    it('should return false for non-existing card', () => {
      const success = cache.deleteCard('non_existing_card');
      expect(success).to.equal(false);
    });
  });

  describe('Card cache attachment methods', () => {
    let cache: CardCache;

    before(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data/', testDir);
      mkdirSync(testCardsPath, { recursive: true });
      mkdirSync(testTemplatesPath, { recursive: true });

      createTestData(testCardsPath, testTemplatesPath);

      cache = new CardCache(prefix);
      await cache.populateFromPath(testProjectPath);
    });
    after(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('should return attachments for existing card', () => {
      const attachments = cache.getCardAttachments('test_1');
      expect(attachments).to.not.equal(undefined);
      expect(attachments).to.be.an('array');
    });

    it('should return undefined for non-existing card', () => {
      const attachments = cache.getCardAttachments('non_existing_card');
      expect(attachments).to.equal(undefined);
    });

    it('should add attachment to existing card', () => {
      const cardKey = 'test_1';
      const fileName = 'new-attachment.pdf';

      const success = cache.addAttachment(cardKey, fileName);

      expect(success).to.equal(true);
      const attachments = cache.getCardAttachments(cardKey);
      expect(attachments?.some((a) => a.fileName === fileName)).to.equal(true);
    });

    it('should not add duplicate attachment', () => {
      const cardKey = 'test_1';
      const fileName = 'duplicate.txt';

      // Add first time
      let success = cache.addAttachment(cardKey, fileName);
      expect(success).to.equal(true);

      // Try to add again
      success = cache.addAttachment(cardKey, fileName);
      expect(success).to.equal(false);

      // Verify only one instance exists
      const attachments = cache.getCardAttachments(cardKey);
      const duplicateCount = attachments?.filter(
        (a) => a.fileName === fileName,
      ).length;
      expect(duplicateCount).to.equal(1);
    });

    it('should return false for non-existing card', () => {
      const success = cache.addAttachment('non_existing_card', 'file.txt');
      expect(success).to.equal(false);
    });

    it('should remove attachment from existing card', () => {
      const cardKey = 'test_1';
      const fileName = 'to-be-deleted.txt';

      // First add an attachment
      cache.addAttachment(cardKey, fileName);
      expect(cache.hasCardAttachment(cardKey, fileName)).to.equal(true);

      // Then delete it
      const success = cache.deleteAttachment(cardKey, fileName);

      expect(success).to.equal(true);
      expect(cache.hasCardAttachment(cardKey, fileName)).to.equal(false);
    });

    it('should return false when trying to delete non-existing attachment', () => {
      const success = cache.deleteAttachment(
        'test_1',
        'non_existing_attachment.txt',
      );
      expect(success).to.equal(false);
    });

    it('should return false for non-existing card', () => {
      const success = cache.deleteAttachment('non_existing_card', 'file.txt');
      expect(success).to.equal(false);
    });

    it('should check if card has specific attachment', () => {
      const cardKey = 'test_1';
      const fileName = 'check-attachment.txt';
      expect(cache.hasCardAttachment(cardKey, fileName)).to.equal(false);
      cache.addAttachment(cardKey, fileName);
      expect(cache.hasCardAttachment(cardKey, fileName)).to.equal(true);
    });

    it('should return false for non-existing card', () => {
      const result = cache.hasCardAttachment('non_existing_card', 'file.txt');
      expect(result).to.equal(false);
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

      expect(success).to.equal(true);
      const attachments = cache.getCardAttachments(cardKey);
      expect(attachments?.length).to.equal(2);
      expect(
        attachments?.some((a) => a.fileName === 'attachment1.txt'),
      ).to.equal(true);
      expect(
        attachments?.some((a) => a.fileName === 'attachment2.pdf'),
      ).to.equal(true);
    });

    it('should return false for non-existing card', () => {
      const success = cache.updateCardAttachments('non_existing_card', []);
      expect(success).to.equal(false);
    });
  });

  describe('Card cache population tests', () => {
    let cache: CardCache;

    before(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data/', testDir);
      mkdirSync(testCardsPath, { recursive: true });
      mkdirSync(testTemplatesPath, { recursive: true });
      createTestData(testCardsPath, testTemplatesPath);

      cache = new CardCache(prefix);
      await cache.populateFromPath(testProjectPath);
    });
    after(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('should rebuild parent-child relationships', () => {
      const parentCard = cache.getCard('test_1');
      expect(parentCard).to.not.equal(undefined);
      expect(parentCard?.children).to.be.an('array');
      const originalChildrenCount = parentCard?.children.length || 0;

      if (parentCard) {
        parentCard.children = [];
      }
      expect(parentCard?.children.length).to.equal(0);

      cache.populateChildrenRelationships();

      const updatedParentCard = cache.getCard('test_1');
      expect(updatedParentCard?.children.length).to.equal(
        originalChildrenCount,
      );
      expect(updatedParentCard?.children).to.include('test_2');
      expect(updatedParentCard?.children).to.include('test_3');
    });

    it('should return correct population status', async () => {
      const cache = new CardCache(prefix);

      expect(cache.isPopulated).to.equal(false);

      await cache.populateFromPath(testProjectPath);
      expect(cache.isPopulated).to.equal(true);

      cache.clear();
      expect(cache.isPopulated).to.equal(false);
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
      expect(templateCards.length).to.equal(2);

      // Check that template cards exist in project cache
      for (const templateCard of templateCards) {
        expect(commands.project.hasCard(templateCard.key)).to.equal(true);
        const cachedCard = commands.project.findCard(templateCard.key);
        expect(cachedCard).to.not.equal(undefined);
        expect(cachedCard?.key).to.equal(templateCard.key);
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
        expect(commands.project.hasCard(cardKey)).to.equal(true);
      }

      // Remove template
      const removeCmd = commands.removeCmd;
      await removeCmd.remove('template', name);
      for (const cardKey of templateCardKeys) {
        expect(commands.project.hasCard(cardKey)).to.equal(false);
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

      expect(baseTemplateCards.length).to.be.greaterThan(0);
      for (const templateCard of baseTemplateCards) {
        expect(commands.project.hasCard(templateCard.key)).to.equal(true);
        const cachedCard = commands.project.findCard(templateCard.key);
        expect(cachedCard).to.not.equal(undefined);
        expect(cachedCard?.key).to.equal(templateCard.key);
      }
    }).timeout(10000);

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
      expect(baseTemplateCards.length).to.be.greaterThan(0);
      for (const templateCard of baseTemplateCards) {
        expect(commands.project.hasCard(templateCard.key)).to.equal(true);
        const cachedCard = commands.project.findCard(templateCard.key);
        expect(cachedCard).to.not.equal(undefined);
        expect(cachedCard?.key).to.equal(templateCard.key);
      }

      // Get the imported module name
      const moduleEntry = commands.project.configuration.modules.find(
        (m) => m.location && m.location.includes('module-base'),
      );
      expect(moduleEntry).to.not.equal(undefined);

      // Remove module
      await commands.removeCmd.remove('module', moduleEntry!.name);

      // Verify module template cards are gone from the cache after removal
      const remainingTemplateCards = commands.project
        .allTemplateCards()
        .filter((card: Card) => card.path.includes(`base${sep}templates`));

      expect(remainingTemplateCards.length).to.equal(0);
      for (const card of baseTemplateCards) {
        expect(commands.project.hasCard(card.key)).to.equal(false);
      }
    }).timeout(10000);
  });
});
