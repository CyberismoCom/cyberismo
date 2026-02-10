import { expect } from 'chai';

import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

import {
  validateProjectStructure,
  type MigrationContext,
} from '@cyberismo/migrations';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-migration-utils-tests');

describe('Migration Utilities', () => {
  beforeEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('validateProjectStructure', () => {
    it('should return success for existing project paths', () => {
      const cardRootPath = join(testDir, 'cardRoot');
      const cardsConfigPath = join(testDir, '.cards');

      // Create the directories
      mkdirSync(cardRootPath, { recursive: true });
      mkdirSync(cardsConfigPath, { recursive: true });

      const context: MigrationContext = {
        cardRootPath,
        cardsConfigPath,
        fromVersion: 1,
        toVersion: 2,
      };

      const result = validateProjectStructure(context);
      expect(result.success).to.equal(true);
      expect(result.message).to.equal('Project structure validation passed');
    });

    it('should return failure for non-existent cardRoot path', () => {
      const cardRootPath = join(testDir, 'non-existent-cardRoot');
      const cardsConfigPath = join(testDir, '.cards');

      // Only create cardsConfigPath
      mkdirSync(cardsConfigPath, { recursive: true });

      const context: MigrationContext = {
        cardRootPath,
        cardsConfigPath,
        fromVersion: 1,
        toVersion: 2,
      };

      const result = validateProjectStructure(context);
      expect(result.success).to.equal(false);
      expect(result.message).to.include('Card root path does not exist');
      expect(result.message).to.include(cardRootPath);
      expect(result.error).to.be.an('error');
      expect(result.error?.message).to.equal('Missing cardRoot directory');
    });

    it('should return failure for non-existent cardsConfig path', () => {
      const cardRootPath = join(testDir, 'cardRoot');
      const cardsConfigPath = join(testDir, 'non-existent-.cards');

      // Only create cardRootPath
      mkdirSync(cardRootPath, { recursive: true });

      const context: MigrationContext = {
        cardRootPath,
        cardsConfigPath,
        fromVersion: 1,
        toVersion: 2,
      };

      const result = validateProjectStructure(context);
      expect(result.success).to.equal(false);
      expect(result.message).to.include('Cards config path does not exist');
      expect(result.message).to.include(cardsConfigPath);
      expect(result.error).to.be.an('error');
      expect(result.error?.message).to.equal('Missing .cards directory');
    });

    it('should return failure when both paths do not exist', () => {
      const cardRootPath = join(testDir, 'non-existent-cardRoot');
      const cardsConfigPath = join(testDir, 'non-existent-.cards');

      const context: MigrationContext = {
        cardRootPath,
        cardsConfigPath,
        fromVersion: 1,
        toVersion: 2,
      };

      const result = validateProjectStructure(context);
      expect(result.success).to.equal(false);
      expect(result.message).to.include('Card root path does not exist');
    });
  });
});
