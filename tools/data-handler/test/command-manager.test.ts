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
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SCHEMA_VERSION } from '@cyberismo/migrations';
import { copyDir } from '../src/utils/file-utils.js';
import { readJsonFileSync } from '../src/utils/json.js';
import { openTestWorkspace } from './helpers/open-test-workspace.js';

const testDir = join(import.meta.dirname, 'tmp-command-manager-tests');
const projectPath = join(testDir, 'valid/decision-records');
const configPath = join(projectPath, '.cards', 'local', 'cardsConfig.json');

function setSchemaVersion(version: number | undefined) {
  const config = readJsonFileSync(configPath) as Record<string, unknown>;
  if (version === undefined) {
    delete config.schemaVersion;
  } else {
    config.schemaVersion = version;
  }
  writeFileSync(configPath, JSON.stringify(config, null, 4));
}

describe('CommandManager schema version gate', () => {
  beforeEach(async () => {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('constructs when schema versions match', async () => {
    const ws = await openTestWorkspace(projectPath);
    expect(ws.checkout).toBeDefined();
    ws.checkout.dispose();
  });

  it('throws when the project schema is older', async () => {
    setSchemaVersion(SCHEMA_VERSION - 1);
    await expect(openTestWorkspace(projectPath)).rejects.toThrow(
      "Run 'cyberismo migrate'",
    );
  });

  it('throws when the project schema is newer', async () => {
    setSchemaVersion(SCHEMA_VERSION + 1);
    await expect(openTestWorkspace(projectPath)).rejects.toThrow(
      'Upgrade cyberismo',
    );
  });

  it('throws when schemaVersion is missing', async () => {
    setSchemaVersion(undefined);
    await expect(openTestWorkspace(projectPath)).rejects.toThrow(
      "no 'schemaVersion'",
    );
  });
});
