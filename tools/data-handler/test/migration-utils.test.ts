import { expect, it, describe, beforeEach, afterEach } from 'vitest';

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, rmSync, existsSync } from 'node:fs';

import {
  validateProjectStructure,
  createBackup,
  type MigrationContext,
} from '@cyberismo/migrations';

const baseDir = dirname(fileURLToPath(import.meta.url));
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
      expect(result.success).toBe(true);
      expect(result.message).toBe('Project structure validation passed');
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
      expect(result.success).toBe(false);
      expect(result.message).toContain('Card root path does not exist');
      expect(result.message).toContain(cardRootPath);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toBe('Missing cardRoot directory');
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
      expect(result.success).toBe(false);
      expect(result.message).toContain('Cards config path does not exist');
      expect(result.message).toContain(cardsConfigPath);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toBe('Missing .cards directory');
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
      expect(result.success).toBe(false);
      expect(result.message).toContain('Card root path does not exist');
    });
  });

  describe('createBackup', () => {
    it('should return failure if backupDir is not provided', async () => {
      const cardRootPath = join(testDir, 'cardRoot');
      const cardsConfigPath = join(testDir, '.cards');

      mkdirSync(cardRootPath, { recursive: true });
      mkdirSync(cardsConfigPath, { recursive: true });

      const context: MigrationContext = {
        cardRootPath,
        cardsConfigPath,
        fromVersion: 1,
        toVersion: 2,
        // backupDir is intentionally not set
      };

      const result = await createBackup(context);

      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'Backup directory not specified in migration context',
      );
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toBe('Missing backupDir in context');
    });

    it('should create backup successfully when backupDir is provided', async () => {
      const cardRootPath = join(testDir, 'cardRoot');
      const cardsConfigPath = join(testDir, '.cards');
      const backupDir = join(testDir, 'backups');

      // Create source directories with some content
      mkdirSync(cardRootPath, { recursive: true });
      mkdirSync(cardsConfigPath, { recursive: true });
      mkdirSync(backupDir, { recursive: true });

      const context: MigrationContext = {
        cardRootPath,
        cardsConfigPath,
        fromVersion: 1,
        toVersion: 2,
        backupDir,
      };

      const result = await createBackup(context);
      expect(result.success).toBe(true);
      expect(result.message).toBe('Backup created successfully');

      // Verify backup directory was created
      // The backup should be named backup-v1-<timestamp>
      const backupContents = existsSync(backupDir);
      expect(backupContents).toBe(true);
    });

    it('should handle backup creation failure gracefully', async () => {
      const cardRootPath = join(testDir, 'cardRoot');
      const cardsConfigPath = join(testDir, '.cards');
      // Use an invalid path that will cause mkdir to fail
      const backupDir = '\0invalid-path'; // null character makes path invalid

      mkdirSync(cardRootPath, { recursive: true });
      mkdirSync(cardsConfigPath, { recursive: true });

      const context: MigrationContext = {
        cardRootPath,
        cardsConfigPath,
        fromVersion: 1,
        toVersion: 2,
        backupDir,
      };

      const result = await createBackup(context);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to create backup');
      expect(result.error).toBeInstanceOf(Error);
    });
  });
});
