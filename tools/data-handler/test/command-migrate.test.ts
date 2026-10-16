// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { runMigrationChain, SCHEMA_VERSION } from '@cyberismo/migrations';
import { migrateProject } from '../src/api/directory/migrate-project.js';

import type * as migrations from '@cyberismo/migrations';

vi.mock('@cyberismo/migrations', async (importOriginal) => ({
  ...(await importOriginal<typeof migrations>()),
  runMigrationChain: vi.fn(async () => {}),
}));

const runChainMock = vi.mocked(runMigrationChain);

const testDir = join(import.meta.dirname, 'tmp-command-migrate-tests');
const configFile = join(testDir, '.cards', 'local', 'cardsConfig.json');

function writeConfig(config: Record<string, unknown>) {
  mkdirSync(dirname(configFile), { recursive: true });
  writeFileSync(configFile, JSON.stringify(config, null, 4));
}

describe('migrate command', () => {
  beforeEach(() => {
    runChainMock.mockClear();
    runChainMock.mockResolvedValue(undefined);
    rmSync(testDir, { recursive: true, force: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('rejects when project has no schema version', async () => {
    writeConfig({ cardKeyPrefix: 'demo' });
    await expect(migrateProject(testDir)).rejects.toThrow('no schema version');
    expect(runChainMock).not.toHaveBeenCalled();
  });

  it('reports project already at the latest version', async () => {
    writeConfig({ schemaVersion: SCHEMA_VERSION });
    const message = await migrateProject(testDir);
    expect(message).toContain('already at version');
    expect(runChainMock).not.toHaveBeenCalled();
  });

  it('rejects a project newer than the tool', async () => {
    writeConfig({ schemaVersion: SCHEMA_VERSION + 1 });
    await expect(migrateProject(testDir)).rejects.toThrow('Upgrade cyberismo');
    expect(runChainMock).not.toHaveBeenCalled();
  });

  it('runs the chain from the current version to the latest', async () => {
    writeConfig({ schemaVersion: 1 });
    const message = await migrateProject(testDir);
    expect(runChainMock).toHaveBeenCalledWith(testDir, 1);
    expect(message).toContain('Successfully migrated');
  });

  it('propagates a failed chain', async () => {
    writeConfig({ schemaVersion: SCHEMA_VERSION - 1 });
    runChainMock.mockRejectedValueOnce(
      new Error('Migration to schema 5 failed: boom'),
    );
    await expect(migrateProject(testDir)).rejects.toThrow('boom');
  });
});
