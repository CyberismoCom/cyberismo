import { expect, describe, it, beforeAll, afterAll } from 'vitest';

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  ConfigurationLogger,
  ConfigurationOperation,
  type ConfigurationLogEntry,
} from '../../src/utils/configuration-logger.js';
import { deleteDir, pathExists } from '../../src/utils/file-utils.js';

/* eslint-disable @typescript-eslint/no-unused-expressions */

// Create test artifacts in a temp folder.
const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-configuration-logger-tests');
const testProjectPath = join(testDir, 'test-project');

describe('configuration logger', () => {
  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
    await mkdir(testProjectPath, { recursive: true });
    // Create .cards/local directory structure for new migration log location
    await mkdir(join(testProjectPath, '.cards', 'local', 'migrationLog'), {
      recursive: true,
    });
  });

  afterAll(async () => {
    await deleteDir(testDir);
  });

  describe('basic logging operations', () => {
    afterAll(async () => {
      await ConfigurationLogger.clearLog(testProjectPath);
    });
    it('should log resource deletion', async () => {
      await ConfigurationLogger.log(testProjectPath, {
        operation: ConfigurationOperation.RESOURCE_DELETE,
        target: 'test-resource',
        parameters: { type: 'template' },
      });

      const entries = await ConfigurationLogger.entries(testProjectPath);
      expect(entries).toHaveLength(1);
      expect(entries[0].operation).toBe(ConfigurationOperation.RESOURCE_DELETE);
      expect(entries[0].target).toBe('test-resource');
      expect(entries[0].parameters?.type).toBe('template');
      expect(entries[0].timestamp).toBeTypeOf('string');
    });
    it('should handle logging without parameters', async () => {
      await ConfigurationLogger.log(testProjectPath, {
        operation: ConfigurationOperation.RESOURCE_RENAME,
        target: 'renamed-resource',
      });

      const entries = await ConfigurationLogger.entries(testProjectPath);
      const renameEntry = entries.find(
        (e) => e.operation === ConfigurationOperation.RESOURCE_RENAME,
      );
      expect(renameEntry).toBeDefined();
      expect(renameEntry!.target).toBe('renamed-resource');
      expect(renameEntry!.parameters).toBeUndefined();
    });
    it('should append entries in JSON Lines format', async () => {
      await ConfigurationLogger.clearLog(testProjectPath);

      await ConfigurationLogger.log(testProjectPath, {
        operation: ConfigurationOperation.RESOURCE_DELETE,
        target: 'resource1',
      });
      await ConfigurationLogger.log(testProjectPath, {
        operation: ConfigurationOperation.RESOURCE_RENAME,
        target: 'resource2',
      });

      const logPath = ConfigurationLogger.logFile(testProjectPath);
      const logContent = await readFile(logPath, 'utf-8');
      const lines = logContent.trim().split('\n');

      expect(lines).toHaveLength(2);

      const entry1 = JSON.parse(lines[0]) as ConfigurationLogEntry;
      const entry2 = JSON.parse(lines[1]) as ConfigurationLogEntry;

      expect(entry1.operation).toBe(ConfigurationOperation.RESOURCE_DELETE);
      expect(entry1.target).toBe('resource1');
      expect(entry2.operation).toBe(ConfigurationOperation.RESOURCE_RENAME);
      expect(entry2.target).toBe('resource2');
    });
    it('should preserve entry order', async () => {
      await ConfigurationLogger.clearLog(testProjectPath);

      const entries = [
        { operation: ConfigurationOperation.RESOURCE_DELETE, target: 'first' },
        { operation: ConfigurationOperation.RESOURCE_UPDATE, target: 'second' },
        { operation: ConfigurationOperation.MODULE_REMOVE, target: 'third' },
      ];

      for (const entry of entries) {
        await ConfigurationLogger.log(testProjectPath, entry);
      }

      const result = await ConfigurationLogger.entries(testProjectPath);
      expect(result).toHaveLength(3);
      expect(result[0].target).toBe('first');
      expect(result[1].target).toBe('second');
      expect(result[2].target).toBe('third');
    });
    it('should handle logging errors gracefully', async () => {
      const invalidPath = '/invalid/path/that/does/not/exist';

      await expect(
        ConfigurationLogger.log(invalidPath, {
          operation: ConfigurationOperation.RESOURCE_DELETE,
          target: 'test',
        }),
      ).resolves.not.toThrow();
    });
    it('should handle reading non-existent log file', async () => {
      const nonExistentPath = join(testDir, 'non-existent');

      const entries = await ConfigurationLogger.entries(nonExistentPath);
      expect(entries).toHaveLength(0);
    });
    it('should log module removal', async () => {
      await ConfigurationLogger.clearLog(testProjectPath);

      await ConfigurationLogger.log(testProjectPath, {
        operation: ConfigurationOperation.MODULE_REMOVE,
        target: 'test-module',
        parameters: { location: '/path/to/module' },
      });

      const entries = await ConfigurationLogger.entries(testProjectPath);
      const removeEntry = entries.find(
        (e) => e.operation === ConfigurationOperation.MODULE_REMOVE,
      );
      expect(removeEntry).toBeDefined();
      expect(removeEntry!.target).toBe('test-module');
      expect(removeEntry!.parameters?.location).toBe('/path/to/module');
    });
    it('should get configuration log path', () => {
      const logPath = ConfigurationLogger.logFile(testProjectPath);
      expect(logPath).toContain('.cards');
      expect(logPath).toContain('migrationLog');
      expect(logPath).toContain('current');
      expect(logPath).toContain('migrationLog.jsonl');
    });
    it('should clear log entries', async () => {
      const beforeEntries = (await ConfigurationLogger.entries(testProjectPath))
        .length;
      await ConfigurationLogger.log(testProjectPath, {
        operation: ConfigurationOperation.RESOURCE_DELETE,
        target: 'test1',
      });
      await ConfigurationLogger.log(testProjectPath, {
        operation: ConfigurationOperation.RESOURCE_DELETE,
        target: 'test2',
      });

      let entries = await ConfigurationLogger.entries(testProjectPath);
      expect(entries).toHaveLength(beforeEntries + 2);

      await ConfigurationLogger.clearLog(testProjectPath);

      entries = await ConfigurationLogger.entries(testProjectPath);
      expect(entries).toHaveLength(0);
    });
    it('should return empty array when log file does not exist', async () => {
      await ConfigurationLogger.clearLog(testProjectPath);

      const logPath = ConfigurationLogger.logFile(testProjectPath);
      expect(pathExists(logPath)).toBe(false);
      const entries = await ConfigurationLogger.entries(testProjectPath);
      expect(entries).toHaveLength(0);
    });
    it('should handle corrupted log entries gracefully', async () => {
      const logPath = ConfigurationLogger.logFile(testProjectPath);

      // Write some valid and invalid JSON lines
      const testContent = [
        '{"timestamp":"2025-01-01T12:00:00.000Z","operation":"resource_delete","target":"valid"}',
        'invalid json line', // Will be skipped - invalid JSON
        '{"timestamp":"2025-01-01T12:01:00.000Z","operation":"resource_rename","target":"valid2"}',
        '{"incomplete":true}', // Will be skipped - missing required fields
      ].join('\n');

      await writeFile(logPath, testContent + '\n');

      const entries = await ConfigurationLogger.entries(testProjectPath);
      expect(entries).toHaveLength(2);
      expect(entries[0].target).toBe('valid');
      expect(entries[1].target).toBe('valid2');
    });
    it('should throw when creating version from non-existent log', async () => {
      await ConfigurationLogger.clearLog(testProjectPath);

      await expect(
        ConfigurationLogger.createVersion(testProjectPath, '1.0.0'),
      ).rejects.toThrow('No current migration log exists to version');
    });
    it('should check log existence via static method', async () => {
      const testProjectPath2 = join(testDir, 'test-project-static');
      await ConfigurationLogger.log(testProjectPath2, {
        operation: ConfigurationOperation.RESOURCE_DELETE,
        target: 'test',
      });

      const logPath = ConfigurationLogger.logFile(testProjectPath2);
      expect(pathExists(logPath)).toBe(true);
      expect(ConfigurationLogger.hasBreakingChanges(testProjectPath2)).toBe(
        true,
      );
    });
  });
});
