/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { SCHEMA_VERSION } from '@cyberismo/assets';
import { runMigrationChain } from '../../src/migrations/run-chain.js';

import type { Migration } from '@cyberismo/migrations';

const registry = vi.hoisted(() => ({
  migrations: {} as Record<number, Migration>,
}));

vi.mock('@cyberismo/migrations', () => ({
  availableMigrations: () =>
    Object.keys(registry.migrations)
      .map(Number)
      .sort((a, b) => a - b),
  migration: (version: number) => registry.migrations[version],
}));

const okStep = async () => ({ success: true });

const testDir = join(import.meta.dirname, 'tmp-run-chain-tests');
const configFile = join(testDir, '.cards', 'local', 'cardsConfig.json');

function writeConfig(schemaVersion: number) {
  mkdirSync(dirname(configFile), { recursive: true });
  writeFileSync(configFile, JSON.stringify({ schemaVersion }, null, 4));
}

function storedVersion(): number {
  return (
    JSON.parse(readFileSync(configFile, 'utf-8')) as { schemaVersion: number }
  ).schemaVersion;
}

describe('runMigrationChain', () => {
  let calls: number[] = [];

  const recording = (version: number): Migration => ({
    migrate: async () => {
      calls.push(version);
      return { success: true };
    },
  });

  function fillRegistry() {
    for (let v = 2; v <= SCHEMA_VERSION; v++) {
      registry.migrations[v] = recording(v);
    }
  }

  beforeEach(() => {
    calls = [];
    rmSync(testDir, { recursive: true, force: true });
    writeConfig(1);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    registry.migrations = {};
    vi.restoreAllMocks();
  });

  it('runs the contiguous chain to SCHEMA_VERSION and stamps each step', async () => {
    fillRegistry();
    await runMigrationChain(testDir, 1);
    expect(calls).toEqual(
      Array.from({ length: SCHEMA_VERSION - 1 }, (_, i) => i + 2),
    );
    expect(storedVersion()).toBe(SCHEMA_VERSION);
  });

  it('starts after fromVersion', async () => {
    fillRegistry();
    writeConfig(SCHEMA_VERSION - 1);
    await runMigrationChain(testDir, SCHEMA_VERSION - 1);
    expect(calls).toEqual([SCHEMA_VERSION]);
    expect(storedVersion()).toBe(SCHEMA_VERSION);
  });

  it('refuses a gapped chain before running anything', async () => {
    fillRegistry();
    delete registry.migrations[3];
    await expect(runMigrationChain(testDir, 1)).rejects.toThrow(
      'migration 3 is missing',
    );
    expect(calls).toEqual([]);
    expect(storedVersion()).toBe(1);
  });

  it('stops at a failing migration; earlier steps stay stamped', async () => {
    fillRegistry();
    registry.migrations[3] = {
      migrate: async () => ({ success: false, message: 'boom' }),
    };
    await expect(runMigrationChain(testDir, 1)).rejects.toThrow(
      'Migration to schema 3 failed: boom',
    );
    expect(calls).toEqual([2]);
    expect(storedVersion()).toBe(2);
  });
});

describe('runMigrationChain step guard', () => {
  afterEach(() => {
    registry.migrations = {};
    vi.restoreAllMocks();
  });

  it('refuses a migration that defines steps this runner does not execute', async () => {
    const migrate = vi.fn(okStep);
    registry.migrations = {
      [SCHEMA_VERSION]: { before: okStep, after: okStep, migrate },
    };
    await expect(
      runMigrationChain('/nonexistent', SCHEMA_VERSION - 1),
    ).rejects.toThrow(
      `Migration ${SCHEMA_VERSION} defines before, after step(s)`,
    );
    expect(migrate).not.toHaveBeenCalled();
  });
});
