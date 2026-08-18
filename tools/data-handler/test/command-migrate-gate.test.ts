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

import { SCHEMA_VERSION } from '@cyberismo/assets';
import { Cmd, Commands } from '../src/command-handler.js';
import { copyDir } from '../src/utils/file-utils.js';
import { readJsonFileSync } from '../src/utils/json.js';

describe('schema version gate via command handler', () => {
  const testDir = join(import.meta.dirname, 'tmp-command-migrate-gate-tests');
  const projectPath = join(testDir, 'valid/decision-records');
  const configPath = join(projectPath, '.cards', 'local', 'cardsConfig.json');

  beforeEach(async () => {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
    const config = readJsonFileSync(configPath) as Record<string, unknown>;
    config.schemaVersion = SCHEMA_VERSION - 1;
    writeFileSync(configPath, JSON.stringify(config, null, 4));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('refuses other commands on an older project but lets migrate through', async () => {
    const commandHandler = new Commands();
    const refused = await commandHandler.command(Cmd.validate, [], {
      projectPath,
    });
    expect(refused.statusCode).toBe(400);
    expect(refused.message).toContain("Run 'cyberismo migrate'");

    const migrated = await commandHandler.command(Cmd.migrate, [], {
      projectPath,
    });
    expect(migrated.statusCode).toBe(200);

    const allowed = await commandHandler.command(Cmd.validate, [], {
      projectPath,
    });
    expect(allowed.statusCode).toBe(200);
  });
});
