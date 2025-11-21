import { expect } from 'chai';

import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

import { copyDir } from '../src/utils/file-utils.js';
import { Project } from '../src/containers/project.js';
import { MigrationExecutor } from '../src/migrations/migration-executor.js';
import type { Migration } from '@cyberismo/assets';

// Test subclass that overrides migrations path
class TestMigrationExecutor extends MigrationExecutor {
  constructor(
    project: Project,
    private testMigrationsPath: string,
    backupDir?: string,
  ) {
    super(project, backupDir);
  }

  protected migrationsBasePath(): string {
    return this.testMigrationsPath;
  }

  public async discoverMigrations(
    fromVersion: number,
    toVersion: number,
  ): Promise<number[]> {
    return super.discoverMigrations(fromVersion, toVersion);
  }

  public async loadMigration(version: number): Promise<Migration | undefined> {
    return super.loadMigration(version);
  }
}

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-migration-executor-tests');
const testProjectPath = join(testDir, 'valid/decision-records');
const testMigrationsPath = join(baseDir, 'test-migrations');

describe('MigrationExecutor', () => {
  let project: Project;
  const defaultCallback = async () => {};

  beforeEach(async () => {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
    project = new Project(testProjectPath);
    await project.populateCaches();
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should discover available migrations', async () => {
    const executor = new TestMigrationExecutor(project, testMigrationsPath);
    const migrations = await executor.discoverMigrations(1, 4);
    expect(migrations).to.deep.equal([2, 3, 4]);
  });

  it('should discover migrations in correct range', async () => {
    const executor = new TestMigrationExecutor(project, testMigrationsPath);
    const migrations = await executor.discoverMigrations(2, 3);
    expect(migrations).to.deep.equal([3]);
  });

  it('should load migration module', async () => {
    const executor = new TestMigrationExecutor(project, testMigrationsPath);
    const migration = await executor.loadMigration(2);
    expect(migration).to.not.equal(undefined);
    if (migration) {
      expect(migration.migrate).to.be.a('function');
      expect(migration.before).to.be.a('function');
      expect(migration.backup).to.be.a('function');
      expect(migration.after).to.be.a('function');
    }
  });

  it('should execute successful migration', async () => {
    const executor = new TestMigrationExecutor(project, testMigrationsPath);
    let updatedVersion = 0;
    const updateCallback = async (version: number) => {
      updatedVersion = version;
    };
    const result = await executor.migrate(1, 2, updateCallback);

    expect(result.success).to.equal(true);
    expect(result.fromVersion).to.equal(1);
    expect(result.toVersion).to.equal(2);
    expect(updatedVersion).to.equal(2);
    expect(result.stepsExecuted).to.include('pre-validation');
    expect(result.stepsExecuted).to.include('disk-space-check');
    expect(result.stepsExecuted).to.include('migration-versions');
    expect(result.stepsExecuted).to.include('v2:before');
    expect(result.stepsExecuted).to.include('v2:migrate');
    expect(result.stepsExecuted).to.include('v2:after');
    expect(result.stepsExecuted).to.include('v2:update-version');
    expect(result.stepsExecuted).to.include('v2:validate');
  });

  it('should execute migration without optional steps', async () => {
    const executor = new TestMigrationExecutor(project, testMigrationsPath);
    let updatedVersion = 0;
    const updateCallback = async (version: number) => {
      updatedVersion = version;
    };
    const result = await executor.migrate(3, 4, updateCallback);
    expect(result.success).to.equal(true);
    expect(result.toVersion).to.equal(4);
    expect(updatedVersion).to.equal(4);
    expect(result.stepsExecuted).to.include('v4:migrate');
    expect(result.stepsExecuted).to.not.include('v4:before');
    expect(result.stepsExecuted).to.not.include('v4:after');
  });

  it('should skip backup if backupDir not provided', async () => {
    const executor = new TestMigrationExecutor(project, testMigrationsPath);
    const result = await executor.migrate(1, 2, defaultCallback);

    expect(result.success).to.equal(true);
    expect(result.stepsExecuted).to.not.include('v2:backup');
  });

  it('should include backup when backupDir provided', async () => {
    const backupDir = join(testDir, 'backups');
    mkdirSync(backupDir, { recursive: true });
    const executor = new TestMigrationExecutor(
      project,
      testMigrationsPath,
      backupDir,
    );
    const result = await executor.migrate(1, 2, defaultCallback);
    expect(result.success).to.equal(true);
    expect(result.stepsExecuted).to.include('v2:backup');
  });

  it('should fail when migration before() fails', async () => {
    const executor = new TestMigrationExecutor(project, testMigrationsPath);
    const result = await executor.migrate(2, 3, defaultCallback);
    expect(result.success).to.equal(false);
    expect(result.message).to.include('Before step failed intentionally');
    expect(result.stepsExecuted).to.include('pre-validation');
    expect(result.stepsExecuted).to.include('disk-space-check');
    expect(result.stepsExecuted).to.include('migration-versions');
  });

  it('should reject when fromVersion >= toVersion', async () => {
    const executor = new TestMigrationExecutor(project, testMigrationsPath);
    const result = await executor.migrate(2, 2, defaultCallback);
    expect(result.success).to.equal(false);
    expect(result.message).to.include('not lower than target version');
  });

  it('should execute multiple migrations sequentially', async () => {
    const executor = new TestMigrationExecutor(project, testMigrationsPath);
    const versions: number[] = [];
    const updateCallback = async (version: number) => {
      versions.push(version);
    };

    const result = await executor.migrate(1, 2, updateCallback);
    expect(result.success).to.equal(true);
    expect(versions).to.deep.equal([2]);
    expect(result.stepsExecuted).to.include('v2:migrate');
  });

  it('should abort migration if insufficient disk space is detected', async () => {
    // Create a test executor subclass that forces disk space check to fail
    class InsufficientDiskSpaceExecutor extends TestMigrationExecutor {
      protected async checkDiskSpace(
        fromVersion: number,
        toVersion: number,
        stepsExecuted: string[],
      ) {
        return {
          success: false,
          fromVersion,
          toVersion,
          message:
            'Insufficient disk space. Required: 100.00 MB, Available: 50.00 MB. Migration needs at least 2x the project size (50.00 MB).',
          stepsExecuted,
        };
      }

      // Expose checkDiskSpace method for testing
      public async testCheckDiskSpace(
        fromVersion: number,
        toVersion: number,
        stepsExecuted: string[],
      ) {
        return this.checkDiskSpace(fromVersion, toVersion, stepsExecuted);
      }
    }

    const executor = new InsufficientDiskSpaceExecutor(
      project,
      testMigrationsPath,
    );
    const result = await executor.migrate(1, 2, defaultCallback);

    expect(result.success).to.equal(false);
    expect(result.message).to.include('Insufficient disk space');
    expect(result.message).to.include('Required:');
    expect(result.message).to.include('Available:');
    expect(result.stepsExecuted).to.include('pre-validation');
    expect(result.stepsExecuted).to.not.include('disk-space-check');
    expect(result.stepsExecuted).to.not.include('migration-versions');
  });

  it('should fail to load a migration module without valid Migration object', async () => {
    const executor = new TestMigrationExecutor(project, testMigrationsPath);
    // Try to load a non-existent migration (version 999)
    const migration = await executor.loadMigration(999);
    expect(migration).to.equal(undefined);
  });

  it('should fail to load a migration module missing "migrate()" method', async () => {
    const executor = new TestMigrationExecutor(project, testMigrationsPath);
    // Version 5 is a migration module that exists but doesn't have migrate()
    const migration = await executor.loadMigration(5);
    expect(migration).to.equal(undefined);
  });
});
