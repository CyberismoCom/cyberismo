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
import { CommandManager } from '../src/command-manager.js';
import { copyDir } from '../src/utils/file-utils.js';
import { readJsonFileSync } from '../src/utils/json.js';

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

  it('constructs when schema versions match', () => {
    const commands = new CommandManager(projectPath);
    expect(commands.project).toBeDefined();
    commands.project.dispose();
  });

  it('throws when the project schema is older', () => {
    setSchemaVersion(SCHEMA_VERSION - 1);
    expect(() => new CommandManager(projectPath)).toThrow(
      "Run 'cyberismo migrate'",
    );
  });

  it('throws when the project schema is newer', () => {
    setSchemaVersion(SCHEMA_VERSION + 1);
    expect(() => new CommandManager(projectPath)).toThrow('Upgrade cyberismo');
  });

  it('throws when schemaVersion is missing', () => {
    setSchemaVersion(undefined);
    expect(() => new CommandManager(projectPath)).toThrow("no 'schemaVersion'");
  });
});
