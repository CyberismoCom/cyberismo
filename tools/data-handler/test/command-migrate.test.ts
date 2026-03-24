import { expect, it, describe } from 'vitest';

import { Migrate } from '../src/commands/migrate.js';
import { SCHEMA_VERSION } from '@cyberismo/assets';

import type { MigrationResult } from '@cyberismo/migrations';
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
    await expect(migrateCmd.migrate()).rejects.toThrow('no schema version');
  });

  it('should report project already at target version', async () => {
    const version = SCHEMA_VERSION;
    mockProject.configuration.schemaVersion = version;
    const migrateCmd = new Migrate(mockProject as unknown as Project);
    const result = await migrateCmd.migrate(version);
    expect(result.success).toBe(true);
    expect(result.message).toContain('already at version');
    expect(mockProject.configuration.schemaVersion).toBe(version);
  });

  it('should reject downgrading', async () => {
    const currentVersion = 5;
    const targetVersion = 2;
    mockProject.configuration.schemaVersion = currentVersion;
    const migrateCmd = new Migrate(mockProject as unknown as Project);
    await expect(migrateCmd.migrate(targetVersion)).rejects.toThrow(
      'Cannot downgrade',
    );
    expect(mockProject.configuration.schemaVersion).toBe(currentVersion);
  });

  it('should reject skipping versions when specific version provided', async () => {
    const currentVersion = SCHEMA_VERSION;
    const targetVersion = SCHEMA_VERSION + 2;
    mockProject.configuration.schemaVersion = currentVersion;
    const migrateCmd = new Migrate(mockProject as unknown as Project);
    await expect(migrateCmd.migrate(targetVersion)).rejects.toThrow(
      `Cannot migrate to version ${targetVersion}. Current application supports up to version ${SCHEMA_VERSION}.`,
    );
    expect(mockProject.configuration.schemaVersion).toBe(currentVersion);
  });

  it('should allow migrating to next sequential version', async () => {
    const currentVersion = SCHEMA_VERSION - 1;
    const targetVersion = SCHEMA_VERSION;
    mockProject.configuration.schemaVersion = currentVersion;
    const migrateCmd = new Migrate(mockProject as unknown as Project);
    const result = await migrateCmd.migrate(targetVersion);
    expect(result.success).toBe(true);
    expect(mockProject.configuration.schemaVersion).toBe(targetVersion);
  });

  it('should allow migrating to latest without version check', async () => {
    const currentVersion = SCHEMA_VERSION;
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
    expect(result.success).toBe(true);
    expect(mockProject.configuration.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('should pass backup directory to runMigrations', async () => {
    // Test migration to current SCHEMA_VERSION

    const currentVersion = SCHEMA_VERSION - 1;
    const targetVersion = SCHEMA_VERSION;
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
    expect(capturedBackupDir).toBe('/custom/backup');
    expect(mockProject.configuration.schemaVersion).toBe(targetVersion);
  });

  it('should handle migration failure', async () => {
    const currentVersion = SCHEMA_VERSION - 1;
    const targetVersion = SCHEMA_VERSION;
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
    expect(result.success).toBe(false);
    expect(result.message).toContain('Migration validation failed');
    expect(mockProject.configuration.schemaVersion).toBe(currentVersion);
  });

  it('should pass timeout to runMigrations', async () => {
    const currentVersion = SCHEMA_VERSION - 1;
    const targetVersion = SCHEMA_VERSION;
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
    expect(capturedTimeout).toBe(customTimeout);
    expect(mockProject.configuration.schemaVersion).toBe(targetVersion);
  });
});
