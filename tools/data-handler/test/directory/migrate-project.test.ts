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

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { SCHEMA_VERSION } from '@cyberismo/migrations';
import { openProjectAt } from '../../src/directory/local-folder.js';
import { migrateProject } from '../../src/directory/migrate-project.js';
import { SYSTEM_ACTOR } from '../../src/utils/tx-record.js';
import { folders } from './folder.js';

const folder = folders();

describe('migrateProject', () => {
  it('migrates a project opening refuses, so that it opens', async () => {
    const { root } = await folder({ prefix: 'one' });
    const path = join(root, 'one');
    const configPath = join(path, '.cards', 'local', 'cardsConfig.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    config.schemaVersion = SCHEMA_VERSION - 1;
    writeFileSync(configPath, JSON.stringify(config, null, 4));

    expect(await migrateProject(path)).toContain('Successfully migrated');

    const ws = await openProjectAt(path, SYSTEM_ACTOR);
    expect(ws.checkout.configuration.schemaVersion).toBe(SCHEMA_VERSION);
  });
});
