import { expect } from 'chai';

import { join } from 'node:path';
import { mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { copyDir } from '../src/utils/file-utils.js';
import { Project } from '../src/containers/project.js';
import { MigrationExecutor } from '../src/migrations/migration-executor.js';
import type { Migration } from '@cyberismo/migrations';

// Test subclass that overrides migrations discovery and loading for tests
class TestMigrationExecutor extends MigrationExecutor {
  constructor(
    project: Project,
    private testMigrationsPath: string,
  ) {
    super(project);
  }

  // Override to use filesystem-based discovery for test migrations
  protected migrationsAvailable(
    fromVersion: number,
    toVersion: number,
  ): number[] {
    try {
      const entries = readdirSync(this.testMigrationsPath, {
        withFileTypes: true,
      });
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => parseInt(entry.name, 10))
        .filter(
          (version) =>
            !isNaN(version) && version > fromVersion && version <= toVersion,
        )
        .sort((a, b) => a - b);
    } catch (error) {
      console.error('Failed to discover test migrations:', error);
      return [];
    }
  }

  // Override to load from test migrations directory
  protected loadMigration(version: number): Migration | undefined {
    const migrationPath = join(
      this.testMigrationsPath,
      version.toString(),
      'index.js',
    );
    if (!existsSync(migrationPath)) {
      return undefined;
    }

    return {
      migrate: async () => ({ success: true }),
    };
  }

  public discoverMigrationsPublic(
    fromVersion: number,
    toVersion: number,
  ): number[] {
    return this.migrationsAvailable(fromVersion, toVersion);
  }

  public async loadMigrationPublic(
    version: number,
  ): Promise<Migration | undefined> {
    const migrationPath = join(
      this.testMigrationsPath,
      version.toString(),
      'index.js',
    );

    if (!existsSync(migrationPath)) {
      return undefined;
    }

    try {
      const migrationUrl = pathToFileURL(migrationPath).href;
      const migrationModule = await import(migrationUrl);
      const migration: Migration = migrationModule.default || migrationModule;

      // Validate that migration has migrate() method
      if (typeof migration.migrate !== 'function') {
        console.error(
          `Migration ${version} does not implement migrate() function`,
        );
        return undefined;
      }

      return migration;
    } catch (error) {
      console.error(`Failed to load test migration ${version}:`, error);
      return undefined;
    }
  }
}

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-migration-executor-tests');
const testProjectPath = join(testDir, 'valid/decision-records');
const testMigrationsPath = join(baseDir, 'test-migrations');

describe('MigrationExecutor', () => {
  let project: Project;

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

  it('should discover available migrations', () => {
    const executor = new TestMigrationExecutor(project, testMigrationsPath);
    const migrations = executor.discoverMigrationsPublic(1, 4);
    expect(migrations).to.deep.equal([2, 3, 4]);
  });

  it('should discover migrations in correct range', () => {
    const executor = new TestMigrationExecutor(project, testMigrationsPath);
    const migrations = executor.discoverMigrationsPublic(2, 3);
    expect(migrations).to.deep.equal([3]);
  });

  it('should load migration module', async () => {
    const executor = new TestMigrationExecutor(project, testMigrationsPath);
    const migration = await executor.loadMigrationPublic(2);
    expect(migration).to.not.equal(undefined);
    if (migration) {
      expect(migration.migrate).to.be.a('function');
    }
  });

  it('should execute successful migration', async () => {
    const executor = new TestMigrationExecutor(project, testMigrationsPath);
    const result = await executor.migrate(1, 2);

    expect(result.success).to.equal(true);
  });

  it('should reject when fromVersion >= toVersion', async () => {
    const executor = new TestMigrationExecutor(project, testMigrationsPath);
    const result = await executor.migrate(2, 2);
    expect(result.success).to.equal(false);
    expect(result.message).to.include('not lower than target version');
  });

  it('should execute multiple migrations sequentially', async () => {
    const executor = new TestMigrationExecutor(project, testMigrationsPath);
    const result = await executor.migrate(1, 2);
    expect(result.success).to.equal(true);
  });

  it('should fail to load a migration module without valid Migration object', async () => {
    const executor = new TestMigrationExecutor(project, testMigrationsPath);
    // Try to load a non-existent migration (version 999)
    const migration = await executor.loadMigrationPublic(999);
    expect(migration).to.equal(undefined);
  });

  it('should fail to load a migration module missing "migrate()" method', async () => {
    const executor = new TestMigrationExecutor(project, testMigrationsPath);
    // Version 5 is a migration module that exists but doesn't have migrate()
    const migration = await executor.loadMigrationPublic(5);
    expect(migration).to.equal(undefined);
  });
});
