import { expect } from 'chai';

import { Migrate } from '../src/commands/migrate.js';
import { SCHEMA_VERSION } from '@cyberismo/assets';

import type { MigrationResult } from '@cyberismo/migrations';
import type { Project } from '../src/containers/project.js';

// Mock Project for testing
class MockProject {
  basePath = '/test/path';
  configuration = { schemaVersion: 1 };

  async runMigrations(
    fromVersion?: number,
    toVersion?: number,
  ): Promise<MigrationResult> {
    const current = this.configuration.schemaVersion!;
    const from = fromVersion ?? current;
    const to = toVersion ?? from + 1;
    this.configuration.schemaVersion = to;
    return {
      success: true,
      stepsExecuted: ['migrate'],
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
    const version = 2;
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
    const currentVersion = 1;
    const targetVersion = 3; // Try to skip from 1 to 3 (skipping 2)
    mockProject.configuration.schemaVersion = currentVersion;
    const migrateCmd = new Migrate(mockProject as unknown as Project);
    await expect(migrateCmd.migrate(targetVersion)).to.be.rejectedWith(
      `Cannot migrate to version 3. Current application supports up to version 2.`,
    );
    expect(mockProject.configuration.schemaVersion).to.equal(currentVersion);
  });

  it('should allow migrating to next sequential version', async () => {
    const currentVersion = 1;
    const targetVersion = currentVersion + 1;
    mockProject.configuration.schemaVersion = currentVersion;
    const migrateCmd = new Migrate(mockProject as unknown as Project);
    const result = await migrateCmd.migrate(targetVersion);
    expect(result.success).to.equal(true);
    expect(mockProject.configuration.schemaVersion).to.equal(targetVersion);
  });

  it('should allow migrating to latest without version check', async () => {
    const currentVersion = 1;
    mockProject.configuration.schemaVersion = currentVersion;
    // Override to simulate migrating multiple versions at once
    mockProject.runMigrations = async () => {
      mockProject.configuration.schemaVersion = SCHEMA_VERSION;
      return {
        success: true,
        stepsExecuted: ['migrate'],
      };
    };
    const migrateCmd = new Migrate(mockProject as unknown as Project);

    // No target version specified - should migrate to latest without skip check
    const result = await migrateCmd.migrate();
    expect(result.success).to.equal(true);
    expect(mockProject.configuration.schemaVersion).to.equal(SCHEMA_VERSION);
  });

  it('should pass backup directory to runMigrations', async () => {
    const currentVersion = 1;
    const targetVersion = currentVersion + 1;
    mockProject.configuration.schemaVersion = currentVersion;
    let capturedBackupDir: string | undefined;
    mockProject.runMigrations = async (
      fromVersion: number,
      toVersion: number,
      backupDir?: string,
    ) => {
      capturedBackupDir = backupDir;
      mockProject.configuration.schemaVersion = toVersion;
      return {
        success: true,
        stepsExecuted: ['migrate'],
      };
    };
    const migrateCmd = new Migrate(mockProject as unknown as Project);
    await migrateCmd.migrate(targetVersion, '/custom/backup');
    expect(capturedBackupDir).to.equal('/custom/backup');
    expect(mockProject.configuration.schemaVersion).to.equal(targetVersion);
  });

  it('should handle migration failure', async () => {
    const currentVersion = 1;
    const targetVersion = currentVersion + 1;
    mockProject.configuration.schemaVersion = currentVersion;
    mockProject.runMigrations = async () => {
      // Don't update version on failure
      return {
        success: false,
        message: 'Migration validation failed',
        stepsExecuted: ['pre-validation'],
      };
    };
    const migrateCmd = new Migrate(mockProject as unknown as Project);
    const result = await migrateCmd.migrate(targetVersion);
    expect(result.success).to.equal(false);
    expect(result.message).to.include('Migration validation failed');
    expect(mockProject.configuration.schemaVersion).to.equal(currentVersion);
  });

  it('should pass timeout to runMigrations', async () => {
    const currentVersion = 1;
    const targetVersion = currentVersion + 1;
    mockProject.configuration.schemaVersion = currentVersion;
    let capturedTimeout: number | undefined;
    mockProject.runMigrations = async (
      fromVersion: number,
      toVersion: number,
      backupDir?: string,
      timeoutMs?: number,
    ) => {
      capturedTimeout = timeoutMs;
      mockProject.configuration.schemaVersion = toVersion;
      return {
        success: true,
        stepsExecuted: ['migrate'],
      };
    };
    const migrateCmd = new Migrate(mockProject as unknown as Project);
    const customTimeout = 5 * 60 * 1000; // 5 minutes in milliseconds
    await migrateCmd.migrate(targetVersion, undefined, customTimeout);
    expect(capturedTimeout).to.equal(customTimeout);
    expect(mockProject.configuration.schemaVersion).to.equal(targetVersion);
  });
});
