// testing
import { expect } from 'chai';
import { after, before, describe, it } from 'mocha';

// node
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
  before(async () => {
    await mkdir(testDir, { recursive: true });
    await mkdir(testProjectPath, { recursive: true });
  });

  after(async () => {
    await deleteDir(testDir);
  });

  describe('basic logging operations', () => {
    after(async () => {
      await ConfigurationLogger.clearLog(testProjectPath);
    });

    it('should log resource creation', async () => {
      await ConfigurationLogger.log(
        testProjectPath,
        ConfigurationOperation.RESOURCE_CREATE,
        'test-resource',
        {
          parameters: { type: 'template' },
        },
      );

      const entries = await ConfigurationLogger.entries(testProjectPath);
      expect(entries.length).to.equal(1);
      expect(entries[0].operation).to.equal(
        ConfigurationOperation.RESOURCE_CREATE,
      );
      expect(entries[0].target).to.equal('test-resource');
      expect(entries[0].parameters?.type).to.equal('template');
      expect(entries[0].timestamp).to.be.a('string');
      expect(entries[0].id).to.be.a('string');
      expect(entries[0].id.length).to.be.greaterThan(0);
    });
    it('should generate unique UUIDs for each entry', async () => {
      await ConfigurationLogger.clearLog(testProjectPath);

      await ConfigurationLogger.log(
        testProjectPath,
        ConfigurationOperation.RESOURCE_CREATE,
        'resource-a',
      );
      await ConfigurationLogger.log(
        testProjectPath,
        ConfigurationOperation.RESOURCE_CREATE,
        'resource-b',
      );

      const entries = await ConfigurationLogger.entries(testProjectPath);
      expect(entries.length).to.equal(2);
      expect(entries[0].id).to.not.equal(entries[1].id);
    });
    it('should return latest entry ID', async () => {
      await ConfigurationLogger.clearLog(testProjectPath);

      await ConfigurationLogger.log(
        testProjectPath,
        ConfigurationOperation.RESOURCE_CREATE,
        'first',
      );
      await ConfigurationLogger.log(
        testProjectPath,
        ConfigurationOperation.RESOURCE_UPDATE,
        'second',
      );

      const entries = await ConfigurationLogger.entries(testProjectPath);
      const latestId = await ConfigurationLogger.latestEntryId(testProjectPath);
      expect(latestId).to.equal(entries[entries.length - 1].id);
    });
    it('should return undefined for empty log latestEntryId', async () => {
      await ConfigurationLogger.clearLog(testProjectPath);

      const latestId = await ConfigurationLogger.latestEntryId(testProjectPath);
      expect(latestId).to.be.undefined;
    });
    it('should handle logging without parameters', async () => {
      await ConfigurationLogger.log(
        testProjectPath,
        ConfigurationOperation.RESOURCE_DELETE,
        'deleted-resource',
      );

      const entries = await ConfigurationLogger.entries(testProjectPath);
      const deleteEntry = entries.find(
        (e) => e.operation === ConfigurationOperation.RESOURCE_DELETE,
      );
      expect(deleteEntry).to.exist;
      expect(deleteEntry!.target).to.equal('deleted-resource');
      expect(deleteEntry!.parameters).to.be.undefined;
    });
    it('should append entries in JSON Lines format', async () => {
      await ConfigurationLogger.clearLog(testProjectPath);

      await ConfigurationLogger.log(
        testProjectPath,
        ConfigurationOperation.RESOURCE_CREATE,
        'resource1',
      );
      await ConfigurationLogger.log(
        testProjectPath,
        ConfigurationOperation.RESOURCE_DELETE,
        'resource2',
      );

      const logPath = ConfigurationLogger.logFile(testProjectPath);
      const logContent = await readFile(logPath, 'utf-8');
      const lines = logContent.trim().split('\n');

      expect(lines.length).to.equal(2);

      const entry1 = JSON.parse(lines[0]) as ConfigurationLogEntry;
      const entry2 = JSON.parse(lines[1]) as ConfigurationLogEntry;

      expect(entry1.operation).to.equal(ConfigurationOperation.RESOURCE_CREATE);
      expect(entry1.target).to.equal('resource1');
      expect(entry2.operation).to.equal(ConfigurationOperation.RESOURCE_DELETE);
      expect(entry2.target).to.equal('resource2');
    });
    it('should preserve entry order', async () => {
      await ConfigurationLogger.clearLog(testProjectPath);

      const operations = [
        { op: ConfigurationOperation.RESOURCE_CREATE, target: 'first' },
        { op: ConfigurationOperation.RESOURCE_UPDATE, target: 'second' },
        { op: ConfigurationOperation.RESOURCE_DELETE, target: 'third' },
      ];

      for (const { op, target } of operations) {
        await ConfigurationLogger.log(testProjectPath, op, target);
      }

      const entries = await ConfigurationLogger.entries(testProjectPath);
      expect(entries.length).to.equal(3);
      expect(entries[0].target).to.equal('first');
      expect(entries[1].target).to.equal('second');
      expect(entries[2].target).to.equal('third');
    });
    it('should handle logging errors gracefully', async () => {
      const invalidPath = '/invalid/path/that/does/not/exist';

      await expect(
        ConfigurationLogger.log(
          invalidPath,
          ConfigurationOperation.RESOURCE_CREATE,
          'test',
        ),
      ).to.not.be.rejected;
    });
    it('should handle reading non-existent log file', async () => {
      const nonExistentPath = join(testDir, 'non-existent');

      const entries = await ConfigurationLogger.entries(nonExistentPath);
      expect(entries.length).to.equal(0);
    });
    it('should log module addition', async () => {
      await ConfigurationLogger.clearLog(testProjectPath);

      await ConfigurationLogger.log(
        testProjectPath,
        ConfigurationOperation.MODULE_ADD,
        'test-module',
        {
          parameters: {
            location: 'file:/path/to/module',
            branch: 'main',
            private: false,
          },
        },
      );

      const entries = await ConfigurationLogger.entries(testProjectPath);
      expect(entries.length).to.equal(1);
      expect(entries[0].operation).to.equal(ConfigurationOperation.MODULE_ADD);
      expect(entries[0].target).to.equal('test-module');
      expect(entries[0].parameters?.location).to.equal('file:/path/to/module');
      expect(entries[0].parameters?.branch).to.equal('main');
      expect(entries[0].parameters?.private).to.equal(false);
    });
    it('should log module removal', async () => {
      await ConfigurationLogger.log(
        testProjectPath,
        ConfigurationOperation.MODULE_REMOVE,
        'test-module',
        {
          parameters: {
            location: '/path/to/module',
          },
        },
      );

      const entries = await ConfigurationLogger.entries(testProjectPath);
      const removeEntry = entries.find(
        (e) => e.operation === ConfigurationOperation.MODULE_REMOVE,
      );
      expect(removeEntry).to.exist;
      expect(removeEntry!.target).to.equal('test-module');
      expect(removeEntry!.parameters?.location).to.equal('/path/to/module');
    });
    it('should get configuration log path', () => {
      const logPath = ConfigurationLogger.logFile(testProjectPath);
      expect(logPath).to.include('.cards');
      expect(logPath).to.include(join('local', 'migrations'));
      expect(logPath).to.include('migrationLog-1.jsonl');
    });
    it('should clear log entries', async () => {
      const beforeEntries = (await ConfigurationLogger.entries(testProjectPath))
        .length;
      await ConfigurationLogger.log(
        testProjectPath,
        ConfigurationOperation.RESOURCE_CREATE,
        'test1',
      );
      await ConfigurationLogger.log(
        testProjectPath,
        ConfigurationOperation.RESOURCE_CREATE,
        'test2',
      );

      let entries = await ConfigurationLogger.entries(testProjectPath);
      expect(entries.length).to.equal(beforeEntries + 2);

      await ConfigurationLogger.clearLog(testProjectPath);

      entries = await ConfigurationLogger.entries(testProjectPath);
      expect(entries.length).to.equal(0);
    });
    it('should return empty array when log file does not exist', async () => {
      await ConfigurationLogger.clearLog(testProjectPath);

      const entries = await ConfigurationLogger.entries(testProjectPath);
      expect(entries.length).to.equal(0);
    });
    it('should handle corrupted log entries gracefully', async () => {
      const logPath = ConfigurationLogger.logFile(testProjectPath);

      // Write some valid and invalid JSON lines
      const testContent = [
        '{"id":"aaaa","timestamp":"2025-01-01T12:00:00.000Z","operation":"resource_create","target":"valid"}',
        'invalid json line', // Will be skipped - invalid JSON
        '{"id":"bbbb","timestamp":"2025-01-01T12:01:00.000Z","operation":"resource_delete","target":"valid2"}',
        '{"incomplete":true}', // Will be skipped - missing required fields
      ].join('\n');

      await writeFile(logPath, testContent + '\n');

      const entries = await ConfigurationLogger.entries(testProjectPath);
      expect(entries.length).to.equal(2);
      expect(entries[0].target).to.equal('valid');
      expect(entries[1].target).to.equal('valid2');
    });
    it('should check log existence via static method', async () => {
      const testProjectPath2 = join(testDir, 'test-project-static');
      // Create a log entry
      await ConfigurationLogger.log(
        testProjectPath2,
        ConfigurationOperation.RESOURCE_CREATE,
        'test',
      );

      // Check if log path exists for the project that has entries
      const logPath = ConfigurationLogger.logFile(testProjectPath2);
      expect(pathExists(logPath)).to.equal(true);
      expect(ConfigurationLogger.hasLog(testProjectPath2)).to.equal(true);
    });
  });
});
