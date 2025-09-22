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
    // Create .cards/local directory structure for new migration log location
    await mkdir(join(testProjectPath, '.cards', 'local', 'migrationLog'), {
      recursive: true,
    });
  });

  after(async () => {
    await deleteDir(testDir);
    ConfigurationLogger.reset();
  });

  describe('singleton instance management', () => {
    it('should create and return singleton instance', () => {
      const logger1 = ConfigurationLogger.getInstance(testProjectPath);
      const logger2 = ConfigurationLogger.getInstance(testProjectPath);

      expect(logger1).to.equal(logger2);
    });
    it('should create new instance for different project path', () => {
      const testProjectPath2 = join(testDir, 'test-project-2');
      const logger1 = ConfigurationLogger.getInstance(testProjectPath);
      const logger2 = ConfigurationLogger.getInstance(testProjectPath2);

      expect(logger1).to.not.equal(logger2);
    });
    it('should reset singleton instance', () => {
      const logger1 = ConfigurationLogger.getInstance(testProjectPath);
      ConfigurationLogger.reset();
      const logger2 = ConfigurationLogger.getInstance(testProjectPath);

      expect(logger1).to.not.equal(logger2);
    });
  });

  describe('basic logging operations', () => {
    let logger: ConfigurationLogger;

    before(() => {
      ConfigurationLogger.reset();
      logger = ConfigurationLogger.getInstance(testProjectPath);
    });

    after(async () => {
      await logger.clearLog();
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

      const entries = await logger.entries();
      expect(entries.length).to.equal(1);
      expect(entries[0].operation).to.equal(
        ConfigurationOperation.RESOURCE_CREATE,
      );
      expect(entries[0].target).to.equal('test-resource');
      expect(entries[0].parameters?.type).to.equal('template');
      expect(entries[0].timestamp).to.be.a('string');
    });
    it('should handle logging without parameters', async () => {
      await ConfigurationLogger.log(
        testProjectPath,
        ConfigurationOperation.RESOURCE_DELETE,
        'deleted-resource',
      );

      const entries = await logger.entries();
      const deleteEntry = entries.find(
        (e) => e.operation === ConfigurationOperation.RESOURCE_DELETE,
      );
      expect(deleteEntry).to.exist;
      expect(deleteEntry!.target).to.equal('deleted-resource');
      expect(deleteEntry!.parameters).to.be.undefined;
    });
    it('should append entries in JSON Lines format', async () => {
      await logger.clearLog();

      await logger.log(ConfigurationOperation.RESOURCE_CREATE, 'resource1');
      await logger.log(ConfigurationOperation.RESOURCE_DELETE, 'resource2');

      const logContent = await readFile(logger.configurationLog, 'utf-8');
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
      await logger.clearLog();

      const operations = [
        { op: ConfigurationOperation.RESOURCE_CREATE, target: 'first' },
        { op: ConfigurationOperation.RESOURCE_UPDATE, target: 'second' },
        { op: ConfigurationOperation.RESOURCE_DELETE, target: 'third' },
      ];

      for (const { op, target } of operations) {
        await logger.log(op, target);
      }

      const entries = await logger.entries();
      expect(entries.length).to.equal(3);
      expect(entries[0].target).to.equal('first');
      expect(entries[1].target).to.equal('second');
      expect(entries[2].target).to.equal('third');
    });
    it('should handle logging errors gracefully', async () => {
      const invalidPath = '/invalid/path/that/does/not/exist';
      const logger = ConfigurationLogger.getInstance(invalidPath);

      await expect(logger.log(ConfigurationOperation.RESOURCE_CREATE, 'test'))
        .to.not.be.rejected;
    });
    it('should handle reading non-existent log file', async () => {
      const nonExistentPath = join(testDir, 'non-existent');
      const logger = ConfigurationLogger.getInstance(nonExistentPath);

      const entries = await logger.entries();
      expect(entries.length).to.equal(0);
    });
    it('should log module addition', async () => {
      await logger.clearLog();

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

      const entries = await logger.entries();
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

      const entries = await logger.entries();
      const removeEntry = entries.find(
        (e) => e.operation === ConfigurationOperation.MODULE_REMOVE,
      );
      expect(removeEntry).to.exist;
      expect(removeEntry!.target).to.equal('test-module');
      expect(removeEntry!.parameters?.location).to.equal('/path/to/module');
    });
    it('should get configuration log path', () => {
      const logPath = logger.configurationLog;
      expect(logPath).to.include('.cards');
      expect(logPath).to.include('migrationLog');
      expect(logPath).to.include('current');
      expect(logPath).to.include('migrationLog.jsonl');
    });
    it('should clear log entries', async () => {
      const beforeEntries = (await logger.entries()).length;
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

      let entries = await logger.entries();
      expect(entries.length).to.equal(beforeEntries + 2);

      await logger.clearLog();

      entries = await logger.entries();
      expect(entries.length).to.equal(0);
    });
    it('should return empty array when log file does not exist', async () => {
      await logger.clearLog();

      const entries = await logger.entries();
      expect(entries.length).to.equal(0);
    });
    it('should handle corrupted log entries gracefully', async () => {
      const logPath = logger.configurationLog;

      // Write some valid and invalid JSON lines
      const testContent = [
        '{"timestamp":"2025-01-01T12:00:00.000Z","operation":"resource_create","target":"valid"}',
        'invalid json line', // Will be skipped - invalid JSON
        '{"timestamp":"2025-01-01T12:01:00.000Z","operation":"resource_delete","target":"valid2"}',
        '{"incomplete":true}', // Will be skipped - missing required fields
      ].join('\n');

      await writeFile(logPath, testContent + '\n');

      const entries = await logger.entries();
      expect(entries.length).to.equal(2);
      expect(entries[0].target).to.equal('valid');
      expect(entries[1].target).to.equal('valid2');
    });
    it('should check log existence via instance property', async () => {
      const testProjectPath2 = join(testDir, 'test-project-static');
      // Create a log entry
      const logger2 = ConfigurationLogger.getInstance(testProjectPath2);
      await ConfigurationLogger.log(
        testProjectPath2,
        ConfigurationOperation.RESOURCE_CREATE,
        'test',
      );

      // Check if log path exists for the logger that has entries
      expect(pathExists(logger2.configurationLog)).to.equal(true);
      expect(ConfigurationLogger.hasLog(testProjectPath2)).to.equal(true);
    });
  });
});
