import { expect } from 'chai';

import { Migrate } from '../src/commands/migrate.js';
import { SCHEMA_VERSION } from '@cyberismo/assets';

import type { MigrationStepResult } from '@cyberismo/migrations';
import type { Project } from '../src/containers/project.js';
import { RWLock } from '../src/utils/rw-lock.js';

// Mock Project for testing
class MockProject {
  basePath = '/test/path';
  configuration = { schemaVersion: 1 };
  lock = new RWLock();

  async runMigrations(
    fromVersion?: number,
    toVersion?: number,
  ): Promise<MigrationStepResult> {
    const current = this.configuration.schemaVersion!;
    const from = fromVersion ?? current;
    const to = toVersion ?? from + 1;
    this.configuration.schemaVersion = to;
    return {
      success: true,
    };
  }
}

describe('Migrate command', () => {
  const mockProject = new MockProject();

  it('should reject when project has no schema version', async () => {
    mockProject.configuration.schemaVersion = undefined as unknown as number;
    const migrateCmd = new Migrate(mockProject as unknown as Project);
    await expect(migrateCmd.migrate()).to.be.rejectedWith('no schema version');
  });

  it('should report project already at target version', async () => {
    const version = SCHEMA_VERSION;
    mockProject.configuration.schemaVersion = version;
    const migrateCmd = new Migrate(mockProject as unknown as Project);
    const result = await migrateCmd.migrate(version);
    expect(result.success).to.equal(true);
    expect(result.message).to.include('already at version');
    expect(mockProject.configuration.schemaVersion).to.equal(version);
  });

  it('should reject downgrading', async () => {
    const currentVersion = 5;
    const targetVersion = 2;
    mockProject.configuration.schemaVersion = currentVersion;
    const migrateCmd = new Migrate(mockProject as unknown as Project);
    await expect(migrateCmd.migrate(targetVersion)).to.be.rejectedWith(
      'Cannot downgrade',
    );
    expect(mockProject.configuration.schemaVersion).to.equal(currentVersion);
  });

  it('should reject skipping versions when specific version provided', async function () {
    const currentVersion = SCHEMA_VERSION;
    const targetVersion = SCHEMA_VERSION + 2;
    mockProject.configuration.schemaVersion = currentVersion;
    const migrateCmd = new Migrate(mockProject as unknown as Project);
    await expect(migrateCmd.migrate(targetVersion)).to.be.rejectedWith(
      `Cannot migrate to version ${targetVersion}. Current application supports up to version ${SCHEMA_VERSION}.`,
    );
    expect(mockProject.configuration.schemaVersion).to.equal(currentVersion);
  });

  it('should allow migrating to next sequential version', async function () {
    if (SCHEMA_VERSION <= 1) {
      this.skip();
    }
    const currentVersion = SCHEMA_VERSION - 1;
    const targetVersion = SCHEMA_VERSION;
    mockProject.configuration.schemaVersion = currentVersion;
    const migrateCmd = new Migrate(mockProject as unknown as Project);
    const result = await migrateCmd.migrate(targetVersion);
    expect(result.success).to.equal(true);
    expect(mockProject.configuration.schemaVersion).to.equal(targetVersion);
  });

  it('should allow migrating to latest without version check', async () => {
    const currentVersion = SCHEMA_VERSION;
    mockProject.configuration.schemaVersion = currentVersion;
    // Override to simulate migrating multiple versions at once
    mockProject.runMigrations = async () => {
      mockProject.configuration.schemaVersion = SCHEMA_VERSION;
      return {
        success: true,
      };
    };
    const migrateCmd = new Migrate(mockProject as unknown as Project);

    // No target version specified - should migrate to latest without skip check
    const result = await migrateCmd.migrate();
    expect(result.success).to.equal(true);
    expect(mockProject.configuration.schemaVersion).to.equal(SCHEMA_VERSION);
  });

  it('should handle migration failure', async function () {
    if (SCHEMA_VERSION <= 1) {
      this.skip();
    }
    const currentVersion = SCHEMA_VERSION - 1;
    const targetVersion = SCHEMA_VERSION;
    mockProject.configuration.schemaVersion = currentVersion;
    mockProject.runMigrations = async () => {
      // Don't update version on failure
      return {
        success: false,
        message: 'Migration validation failed',
      };
    };
    const migrateCmd = new Migrate(mockProject as unknown as Project);
    const result = await migrateCmd.migrate(targetVersion);
    expect(result.success).to.equal(false);
    expect(result.message).to.include('Migration validation failed');
    expect(mockProject.configuration.schemaVersion).to.equal(currentVersion);
  });
});
