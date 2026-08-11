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
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SCHEMA_VERSION } from '@cyberismo/assets';
import { ensureStagedSchemas } from '../src/modules/staged-migration.js';
import { copyDir } from '../src/utils/file-utils.js';
import { readJsonFileSync } from '../src/utils/json.js';

import type { ResolvedModule } from '../src/modules/resolve/types.js';

const testDir = join(import.meta.dirname, 'tmp-staged-migration-tests');
const stagedPath = join(testDir, 'staged');
const configPath = join(stagedPath, '.cards', 'local', 'cardsConfig.json');
const oldSnapshot = join(
  stagedPath,
  '.cards',
  'local',
  'migrations',
  'migrationLog_1.0.0.jsonl',
);

function setSchemaVersion(version: number | undefined) {
  const config = readJsonFileSync(configPath) as Record<string, unknown>;
  if (version === undefined) {
    delete config.schemaVersion;
  } else {
    config.schemaVersion = version;
  }
  writeFileSync(configPath, JSON.stringify(config, null, 4));
}

function entry(): ResolvedModule {
  return {
    declaration: {
      project: 'mini',
      name: 'decision',
      source: { location: `file:${stagedPath}` },
    },
    remoteUrl: '',
    stagedPath,
  };
}

describe('ensureStagedSchemas', () => {
  beforeEach(async () => {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/valid/decision-records', stagedPath);
    mkdirSync(join(stagedPath, '.cards', 'local', 'migrations'), {
      recursive: true,
    });
    writeFileSync(oldSnapshot, '{}\n', 'utf-8');
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('migrates an older staged tree up to the current schema', async () => {
    setSchemaVersion(4);
    await ensureStagedSchemas([entry()]);
    const config = readJsonFileSync(configPath) as { schemaVersion: number };
    expect(config.schemaVersion).toBe(SCHEMA_VERSION);
    // migration 5 removed the old-format snapshot, proving it ran
    expect(existsSync(oldSnapshot)).toBe(false);
  });

  it('leaves a current staged tree untouched', async () => {
    await ensureStagedSchemas([entry()]);
    expect(existsSync(oldSnapshot)).toBe(true);
  });

  it('refuses a staged tree newer than the tool', async () => {
    setSchemaVersion(SCHEMA_VERSION + 1);
    await expect(ensureStagedSchemas([entry()])).rejects.toThrow(
      'Upgrade cyberismo',
    );
  });

  it('refuses a staged tree without a schema version', async () => {
    setSchemaVersion(undefined);
    await expect(ensureStagedSchemas([entry()])).rejects.toThrow(
      "no 'schemaVersion'",
    );
  });

  it('refuses when the migration chain cannot reach the current schema', async () => {
    setSchemaVersion(0);
    await expect(ensureStagedSchemas([entry()])).rejects.toThrow(
      'No migration path',
    );
  });
});
