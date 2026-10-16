// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { SCHEMA_VERSION } from '@cyberismo/migrations';
import { openProjectAt } from '../../../src/api/directory/local-folder.js';
import { migrateProject } from '../../../src/api/directory/migrate-project.js';
import { SYSTEM_ACTOR } from '../../../src/infra/tx/tx-record.js';
import { folders } from './folder.js';
import { checkoutOf } from '../../../src/state/checkout/internal.js';

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
    expect(checkoutOf(ws).configuration.schemaVersion).toBe(SCHEMA_VERSION);
  });
});
