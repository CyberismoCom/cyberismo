/**
 * Tests for FileSystemProvider storage abstraction.
 */

import { expect } from 'chai';
import { after, before, describe, it } from 'mocha';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../src/utils/file-utils.js';
import {
  FileSystemProvider,
  type FileSystemProviderConfig,
} from '../src/storage/index.js';

describe('FileSystemProvider', () => {
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-filesystem-provider-tests');
  const decisionRecordsPath = join(testDir, 'valid/decision-records');
  let provider: FileSystemProvider;

  before(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);

    const config: FileSystemProviderConfig = {
      basePath: decisionRecordsPath,
      prefix: 'decision',
    };
    provider = new FileSystemProvider(config);
    await provider.initialize();
  });

  after(async () => {
    await provider.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('Card Operations', () => {
    it('should get all cards from project', async () => {
      const cards = await provider.getAllCards('project');
      expect(cards).to.be.an('array');
      expect(cards.length).to.be.greaterThan(0);
      // All cards should have project location
      cards.forEach((card) => {
        expect(card.location).to.equal('project');
      });
    });

    it('should get a specific card by key', async () => {
      const cards = await provider.getAllCards('project');
      expect(cards.length).to.be.greaterThan(0);

      const firstCard = cards[0];
      const fetchedCard = await provider.getCard(firstCard.key);

      expect(fetchedCard).to.not.be.undefined;
      expect(fetchedCard!.key).to.equal(firstCard.key);
      expect(fetchedCard!.metadata).to.deep.equal(firstCard.metadata);
    });

    it('should return undefined for non-existent card', async () => {
      const card = await provider.getCard('nonexistent_12345678');
      expect(card).to.be.undefined;
    });

    it('should check if card exists', async () => {
      const cards = await provider.getAllCards('project');
      expect(cards.length).to.be.greaterThan(0);

      const exists = await provider.cardExists(cards[0].key);
      expect(exists).to.be.true;

      const notExists = await provider.cardExists('nonexistent_12345678');
      expect(notExists).to.be.false;
    });

    it('should get card content', async () => {
      const cards = await provider.getAllCards('project');
      expect(cards.length).to.be.greaterThan(0);

      const content = await provider.getCardContent(cards[0].key);
      expect(content).to.be.a('string');
    });

    it('should get card metadata', async () => {
      const cards = await provider.getAllCards('project');
      expect(cards.length).to.be.greaterThan(0);

      const metadata = await provider.getCardMetadata(cards[0].key);
      expect(metadata).to.not.be.undefined;
      expect(metadata).to.have.property('cardType');
    });
  });

  describe('Content/Metadata Save Operations', () => {
    it('should save card content', async () => {
      const cards = await provider.getAllCards('project');
      expect(cards.length).to.be.greaterThan(0);

      const testCard = cards[0];
      const originalContent = await provider.getCardContent(testCard.key);
      const newContent = originalContent + '\n// Test comment';

      await provider.saveCardContent(testCard.key, newContent);

      const updatedContent = await provider.getCardContent(testCard.key);
      expect(updatedContent).to.equal(newContent);

      // Restore original content
      await provider.saveCardContent(testCard.key, originalContent || '');
    });

    it('should save card metadata', async () => {
      const cards = await provider.getAllCards('project');
      expect(cards.length).to.be.greaterThan(0);

      const testCard = cards[0];
      const originalMetadata = await provider.getCardMetadata(testCard.key);
      expect(originalMetadata).to.not.be.undefined;

      const newMetadata = {
        ...originalMetadata!,
        lastUpdated: new Date().toISOString(),
      };

      await provider.saveCardMetadata(testCard.key, newMetadata);

      const updatedMetadata = await provider.getCardMetadata(testCard.key);
      expect(updatedMetadata?.lastUpdated).to.equal(newMetadata.lastUpdated);

      // Restore original metadata
      await provider.saveCardMetadata(testCard.key, originalMetadata!);
    });
  });

  describe('Attachment Operations', () => {
    it('should list attachments for a card', async () => {
      const cards = await provider.getAllCards('project');
      // Find a card with attachments
      const cardWithAttachments = cards.find(
        (c) => c.attachments && c.attachments.length > 0,
      );

      if (cardWithAttachments) {
        const attachments = await provider.listAttachments(
          cardWithAttachments.key,
        );
        expect(attachments).to.be.an('array');
        expect(attachments.length).to.be.greaterThan(0);
      }
    });

    it('should return empty array for card without attachments', async () => {
      const cards = await provider.getAllCards('project');
      const cardWithoutAttachments = cards.find(
        (c) => !c.attachments || c.attachments.length === 0,
      );

      if (cardWithoutAttachments) {
        const attachments = await provider.listAttachments(
          cardWithoutAttachments.key,
        );
        expect(attachments).to.be.an('array');
        expect(attachments.length).to.equal(0);
      }
    });
  });

  describe('Resource Operations', () => {
    it('should get all resources', async () => {
      const resources = await provider.getAllResources();
      expect(resources).to.be.an('array');
      expect(resources.length).to.be.greaterThan(0);
    });

    it('should get resources by type', async () => {
      const cardTypes = await provider.getAllResources('cardTypes');
      expect(cardTypes).to.be.an('array');

      cardTypes.forEach((resource) => {
        expect(resource.type).to.equal('cardTypes');
      });
    });

    it('should get a specific resource', async () => {
      const cardTypes = await provider.getAllResources('cardTypes');
      expect(cardTypes.length).to.be.greaterThan(0);

      const firstResource = cardTypes[0];
      const fetchedResource = await provider.getResource(
        firstResource.name,
        'cardTypes',
      );

      expect(fetchedResource).to.not.be.undefined;
      expect(fetchedResource!.name).to.equal(firstResource.name);
    });

    it('should check if resource exists', async () => {
      const cardTypes = await provider.getAllResources('cardTypes');
      expect(cardTypes.length).to.be.greaterThan(0);

      const exists = await provider.resourceExists(
        cardTypes[0].name,
        'cardTypes',
      );
      expect(exists).to.be.true;

      const notExists = await provider.resourceExists(
        'nonexistent/cardTypes/fake',
        'cardTypes',
      );
      expect(notExists).to.be.false;
    });
  });

  describe('Project Configuration', () => {
    it('should get project config', async () => {
      const config = await provider.getProjectConfig();
      expect(config).to.not.be.undefined;
      expect(config).to.have.property('name');
      expect(config).to.have.property('cardKeyPrefix');
    });
  });

  describe('Transaction Support', () => {
    it('should begin a transaction', async () => {
      const transaction = await provider.beginTransaction();
      expect(transaction).to.have.property('commit');
      expect(transaction).to.have.property('rollback');

      // Commit should not throw
      await transaction.commit();
    });

    it('should handle rollback gracefully', async () => {
      const transaction = await provider.beginTransaction();
      // Rollback should not throw (even though filesystem doesn't truly rollback)
      await transaction.rollback();
    });
  });

  describe('Lifecycle', () => {
    it('should initialize and close without error', async () => {
      const tempConfig: FileSystemProviderConfig = {
        basePath: decisionRecordsPath,
        prefix: 'decision',
      };
      const tempProvider = new FileSystemProvider(tempConfig);

      await tempProvider.initialize();
      await tempProvider.close();
    });
  });
});

describe('FileSystemProvider with Storage Integration', () => {
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-storage-integration-tests');
  const decisionRecordsPath = join(testDir, 'valid/decision-records');

  before(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
  });

  after(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should work with Project when storageProvider is configured', async () => {
    const { Project } = await import('../src/containers/project.js');

    const config: FileSystemProviderConfig = {
      basePath: decisionRecordsPath,
      prefix: 'decision',
    };
    const provider = new FileSystemProvider(config);
    await provider.initialize();

    const project = new Project(decisionRecordsPath, {
      autoSave: false,
      storageProvider: provider,
    });

    await project.populateCaches();

    // Verify project works with storage provider
    expect(project.storageProvider).to.equal(provider);

    const cards = project.cards();
    expect(cards).to.be.an('array');
    expect(cards.length).to.be.greaterThan(0);

    await provider.close();
    project.dispose();
  });
});
