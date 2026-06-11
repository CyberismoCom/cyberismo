import { expect, describe, it, beforeAll, afterAll } from 'vitest';

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  ConfigurationLogger,
  type ConfigurationLogEntry,
} from '../../src/utils/configuration-logger.js';
import { deleteDir, pathExists } from '../../src/utils/file-utils.js';
import { ProjectPaths } from '../../src/containers/project/project-paths.js';

// Create test artifacts in a temp folder.
const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-configuration-logger-tests');
const testProjectPath = join(testDir, 'test-project');

async function freshProject(name: string): Promise<string> {
  const projectPath = join(testDir, name);
  await mkdir(projectPath, { recursive: true });
  await mkdir(join(projectPath, '.cards', 'local', 'migrationLog'), {
    recursive: true,
  });
  return projectPath;
}

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

  it('writes entries in the released operation/parameters shape', async () => {
    const projectPath = await freshProject('shape-test');
    await ConfigurationLogger.log(projectPath, {
      operation: 'resource_update',
      target: 'foo/cardTypes/bar',
      parameters: {
        key: 'customFields',
        operation: { name: 'remove', target: 'priority' },
      },
    });
    const entries = await ConfigurationLogger.entries(projectPath);
    expect(entries).toHaveLength(1);
    expect(entries[0].operation).toBe('resource_update');
    expect(entries[0].target).toBe('foo/cardTypes/bar');
    // Logs written by released versions use this shape; the interim
    // kind/payload shape must not come back.
    expect(entries[0]).not.toHaveProperty('kind');
    expect(entries[0]).not.toHaveProperty('payload');
  });

  describe('basic logging operations', () => {
    afterAll(async () => {
      await ConfigurationLogger.clearLog(testProjectPath);
    });
    it('should log resource deletion', async () => {
      await ConfigurationLogger.log(testProjectPath, {
        operation: 'resource_delete',
        target: 'test-resource',
        parameters: { type: 'template' },
      });

      const entries = await ConfigurationLogger.entries(testProjectPath);
      expect(entries).toHaveLength(1);
      expect(entries[0].operation).toBe('resource_delete');
      expect(entries[0].target).toBe('test-resource');
      expect(entries[0].parameters?.type).toBe('template');
      expect(entries[0].timestamp).toBeTypeOf('string');
    });
    it('should handle logging without parameters', async () => {
      await ConfigurationLogger.log(testProjectPath, {
        operation: 'resource_rename',
        target: 'renamed-resource',
        parameters: {},
      });

      const entries = await ConfigurationLogger.entries(testProjectPath);
      const renameEntry = entries.find(
        (e) => e.operation === 'resource_rename',
      );
      expect(renameEntry).toBeDefined();
      expect(renameEntry!.target).toBe('renamed-resource');
      expect(renameEntry!.parameters).toBeDefined();
    });
    it('should append entries in JSON Lines format', async () => {
      await ConfigurationLogger.clearLog(testProjectPath);

      await ConfigurationLogger.log(testProjectPath, {
        operation: 'resource_delete',
        target: 'resource1',
        parameters: {},
      });
      await ConfigurationLogger.log(testProjectPath, {
        operation: 'resource_rename',
        target: 'resource2',
        parameters: {},
      });

      const logPath = ConfigurationLogger.logFile(testProjectPath);
      const logContent = await readFile(logPath, 'utf-8');
      const lines = logContent.trim().split('\n');

      expect(lines).toHaveLength(2);

      const entry1 = JSON.parse(lines[0]) as ConfigurationLogEntry;
      const entry2 = JSON.parse(lines[1]) as ConfigurationLogEntry;

      expect(entry1.operation).toBe('resource_delete');
      expect(entry1.target).toBe('resource1');
      expect(entry2.operation).toBe('resource_rename');
      expect(entry2.target).toBe('resource2');
    });
    it('should preserve entry order', async () => {
      await ConfigurationLogger.clearLog(testProjectPath);

      const entries = [
        {
          operation: 'resource_delete' as const,
          target: 'first',
          parameters: {},
        },
        {
          operation: 'resource_update' as const,
          target: 'second',
          parameters: {},
        },
        {
          operation: 'resource_rename' as const,
          target: 'third',
          parameters: {},
        },
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
          operation: 'resource_delete',
          target: 'test',
          parameters: {},
        }),
      ).resolves.not.toThrow();
    });
    it('should handle reading non-existent log file', async () => {
      const nonExistentPath = join(testDir, 'non-existent');

      const entries = await ConfigurationLogger.entries(nonExistentPath);
      expect(entries).toHaveLength(0);
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
        operation: 'resource_delete',
        target: 'test1',
        parameters: {},
      });
      await ConfigurationLogger.log(testProjectPath, {
        operation: 'resource_delete',
        target: 'test2',
        parameters: {},
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
    it('should return null when creating version from non-existent log (empty seal)', async () => {
      await ConfigurationLogger.clearLog(testProjectPath);

      const result = await ConfigurationLogger.createVersion(
        testProjectPath,
        '1.0.0',
      );
      expect(result).toBeNull();
    });
    it('should check log existence via static method', async () => {
      const testProjectPath2 = join(testDir, 'test-project-static');
      await ConfigurationLogger.log(testProjectPath2, {
        operation: 'resource_delete',
        target: 'test',
        parameters: {},
      });

      const logPath = ConfigurationLogger.logFile(testProjectPath2);
      expect(pathExists(logPath)).toBe(true);
      expect(ConfigurationLogger.hasBreakingChanges(testProjectPath2)).toBe(
        true,
      );
    });
  });

  it('createVersion succeeds with no current log (empty seal)', async () => {
    const projectPath = await freshProject('empty-seal');
    // No entries have been logged; migrationLog.jsonl does not exist.
    await ConfigurationLogger.createVersion(projectPath, '1.0.1');
    // The versioned log file should also not exist (empty seal = no file).
    const paths = new ProjectPaths(projectPath);
    const versionedPath = join(
      paths.migrationLogFolder,
      'migrationLog_0.0.0_1.0.1.jsonl',
    );
    expect(await pathExists(versionedPath)).toBe(false);
  });
  it('createVersion seals continuing the lineage from the last sealed version', async () => {
    const projectPath = await freshProject('lineage-seal');
    const paths = new ProjectPaths(projectPath);
    await mkdir(paths.migrationLogFolder, { recursive: true });
    await writeFile(
      join(paths.migrationLogFolder, 'migrationLog_0.0.0_1.0.0.jsonl'),
      '',
    );
    await ConfigurationLogger.log(projectPath, {
      operation: 'resource_delete',
      target: 'some-resource',
      parameters: {},
    });

    const result = await ConfigurationLogger.createVersion(
      projectPath,
      '1.1.0',
    );

    const expectedPath = join(
      paths.migrationLogFolder,
      'migrationLog_1.0.0_1.1.0.jsonl',
    );
    expect(result).toBe(expectedPath);
    expect(pathExists(expectedPath)).toBe(true);
    expect(pathExists(paths.configurationChangesLog)).toBe(false);
  });
  it('createVersion starts the lineage from 0.0.0 on the first seal', async () => {
    const projectPath = await freshProject('first-seal');
    await ConfigurationLogger.log(projectPath, {
      operation: 'resource_delete',
      target: 'some-resource',
      parameters: {},
    });

    const result = await ConfigurationLogger.createVersion(
      projectPath,
      '1.0.0',
    );

    const paths = new ProjectPaths(projectPath);
    const expectedPath = join(
      paths.migrationLogFolder,
      'migrationLog_0.0.0_1.0.0.jsonl',
    );
    expect(result).toBe(expectedPath);
    expect(pathExists(expectedPath)).toBe(true);
  });
  it('accepts and reads project_rename entries', async () => {
    const projectPath = await freshProject('project-rename-log');
    await ConfigurationLogger.log(projectPath, {
      operation: 'project_rename',
      target: 'new-prefix',
      parameters: { oldPrefix: 'old-prefix', newPrefix: 'new-prefix' },
    });
    const entries = await ConfigurationLogger.entries(projectPath);
    expect(entries).toHaveLength(1);
    expect(entries[0].operation).toBe('project_rename');
    expect(entries[0].parameters).toEqual({
      oldPrefix: 'old-prefix',
      newPrefix: 'new-prefix',
    });
  });
});
