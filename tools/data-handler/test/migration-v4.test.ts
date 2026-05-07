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

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { migration as getMigration } from '@cyberismo/migrations';

const testDir = join(import.meta.dirname, 'tmp-migration-v4-tests');
const cardsConfigPath = join(testDir, '.cards');
const localDir = join(cardsConfigPath, 'local');
const configPath = join(localDir, 'cardsConfig.json');

const writeConfig = (config: object) => {
  writeFileSync(configPath, JSON.stringify(config, null, 4) + '\n', 'utf-8');
};

const readConfig = (): Record<string, unknown> =>
  JSON.parse(readFileSync(configPath, 'utf-8'));

describe('migration v4 (strip branch field)', () => {
  beforeEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(localDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  const v4 = () => {
    const m = getMigration(4);
    if (!m) throw new Error('Migration 4 not registered');
    return m;
  };

  const ctx = {
    cardRootPath: join(testDir, 'cardRoot'),
    cardsConfigPath,
    fromVersion: 3,
    toVersion: 4,
  };

  it('removes branch from a single module', async () => {
    writeConfig({
      schemaVersion: 3,
      cardKeyPrefix: 'demo',
      name: 'demo',
      modules: [
        {
          name: 'mod',
          location: 'https://example.com/repo.git',
          branch: 'develop',
        },
      ],
      hubs: [],
    });

    const result = await v4().migrate(ctx);
    expect(result.success).toBe(true);

    const after = readConfig();
    expect(after.modules).toEqual([
      { name: 'mod', location: 'https://example.com/repo.git' },
    ]);
  });

  it('preserves other module fields', async () => {
    writeConfig({
      schemaVersion: 3,
      cardKeyPrefix: 'demo',
      name: 'demo',
      modules: [
        {
          name: 'mod',
          location: 'https://example.com/repo.git',
          branch: 'main',
          private: true,
          version: '^1.2.0',
        },
      ],
      hubs: [],
    });

    await v4().migrate(ctx);

    const [mod] = readConfig().modules as Array<Record<string, unknown>>;
    expect(mod).toEqual({
      name: 'mod',
      location: 'https://example.com/repo.git',
      private: true,
      version: '^1.2.0',
    });
  });

  it('strips branch from each entry when multiple modules carry it', async () => {
    writeConfig({
      schemaVersion: 3,
      cardKeyPrefix: 'demo',
      name: 'demo',
      modules: [
        { name: 'a', location: 'file:./a', branch: 'feat/a' },
        { name: 'b', location: 'file:./b' },
        { name: 'c', location: 'file:./c', branch: 'release' },
      ],
      hubs: [],
    });

    await v4().migrate(ctx);

    const modules = readConfig().modules as Array<Record<string, unknown>>;
    expect(modules.every((m) => !('branch' in m))).toBe(true);
    expect(modules.map((m) => m.name)).toEqual(['a', 'b', 'c']);
  });

  it('is a no-op when no module carries branch', async () => {
    const original = {
      schemaVersion: 3,
      cardKeyPrefix: 'demo',
      name: 'demo',
      modules: [{ name: 'mod', location: 'file:./mod' }],
      hubs: [],
    };
    writeConfig(original);
    const before = readFileSync(configPath, 'utf-8');

    const result = await v4().migrate(ctx);
    expect(result.success).toBe(true);

    expect(readFileSync(configPath, 'utf-8')).toBe(before);
  });

  it('handles configs with empty modules array', async () => {
    writeConfig({
      schemaVersion: 3,
      cardKeyPrefix: 'demo',
      name: 'demo',
      modules: [],
      hubs: [],
    });

    const result = await v4().migrate(ctx);
    expect(result.success).toBe(true);
    expect(readConfig().modules).toEqual([]);
  });

  it('handles configs without a modules property', async () => {
    writeConfig({
      schemaVersion: 3,
      cardKeyPrefix: 'demo',
      name: 'demo',
      hubs: [],
    });

    const result = await v4().migrate(ctx);
    expect(result.success).toBe(true);
    expect(readConfig().modules).toBeUndefined();
  });

  it('is idempotent when run twice', async () => {
    writeConfig({
      schemaVersion: 3,
      cardKeyPrefix: 'demo',
      name: 'demo',
      modules: [{ name: 'mod', location: 'file:./mod', branch: 'develop' }],
      hubs: [],
    });

    await v4().migrate(ctx);
    const afterFirst = readFileSync(configPath, 'utf-8');
    await v4().migrate(ctx);
    expect(readFileSync(configPath, 'utf-8')).toBe(afterFirst);
  });
});
