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

import { afterEach, describe, expect, it, vi } from 'vitest';

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
