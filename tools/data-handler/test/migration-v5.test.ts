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

import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { migration as getMigration } from '@cyberismo/migrations';

const testDir = join(import.meta.dirname, 'tmp-migration-v5-tests');
const cardsConfigPath = join(testDir, '.cards');
const localDir = join(cardsConfigPath, 'local');
const migrationsDir = join(localDir, 'migrations');
const currentDir = join(migrationsDir, 'current');

const oldSnapshot = 'migrationLog_1.0.0.jsonl';
const lineageSeal = 'migrationLog_0.0.0_1.0.0.jsonl';
const currentLog = 'migrationLog.jsonl';

describe('migration v5 (remove pre-replay migration log snapshots)', () => {
  beforeEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(currentDir, { recursive: true });
    writeFileSync(join(migrationsDir, oldSnapshot), '{}\n', 'utf-8');
    writeFileSync(join(migrationsDir, lineageSeal), '{}\n', 'utf-8');
    writeFileSync(join(currentDir, currentLog), '{}\n', 'utf-8');
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  const v5 = () => {
    const m = getMigration(5);
    if (!m) throw new Error('Migration 5 not registered');
    return m;
  };

  const ctx = {
    cardRootPath: join(testDir, 'cardRoot'),
    cardsConfigPath,
    fromVersion: 4,
    toVersion: 5,
  };

  it('removes old single-version snapshots only', async () => {
    const result = await v5().migrate(ctx);
    expect(result.success).toBe(true);

    expect(existsSync(join(migrationsDir, oldSnapshot))).toBe(false);
    expect(existsSync(join(migrationsDir, lineageSeal))).toBe(true);
    expect(existsSync(join(currentDir, currentLog))).toBe(true);
  });

  it('reports removed files in stepsExecuted', async () => {
    const result = (await v5().migrate(ctx)) as {
      success: boolean;
      stepsExecuted: string[];
    };
    expect(
      result.stepsExecuted.some((step) => step.includes(oldSnapshot)),
    ).toBe(true);
  });

  it('removes multiple old snapshots', async () => {
    writeFileSync(join(migrationsDir, 'migrationLog_0.2.10.jsonl'), '{}\n');

    const result = await v5().migrate(ctx);
    expect(result.success).toBe(true);

    expect(readdirSync(migrationsDir).sort()).toEqual(['current', lineageSeal]);
  });

  it('leaves unrelated files untouched', async () => {
    writeFileSync(join(migrationsDir, 'notes.txt'), 'keep me\n');
    writeFileSync(join(migrationsDir, 'migrationLog_abc.jsonl'), '{}\n');

    await v5().migrate(ctx);

    expect(existsSync(join(migrationsDir, 'notes.txt'))).toBe(true);
    expect(existsSync(join(migrationsDir, 'migrationLog_abc.jsonl'))).toBe(
      true,
    );
  });

  it('succeeds when the migrations folder does not exist', async () => {
    rmSync(migrationsDir, { recursive: true, force: true });

    const result = await v5().migrate(ctx);
    expect(result.success).toBe(true);
  });

  it('is idempotent when run twice', async () => {
    await v5().migrate(ctx);
    const afterFirst = readdirSync(migrationsDir).sort();

    const result = await v5().migrate(ctx);
    expect(result.success).toBe(true);
    expect(readdirSync(migrationsDir).sort()).toEqual(afterFirst);
    expect(existsSync(join(migrationsDir, lineageSeal))).toBe(true);
    expect(existsSync(join(currentDir, currentLog))).toBe(true);
  });
});
