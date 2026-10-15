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
import { openProjectAt } from '../../src/api/directory/local-folder.js';
import { folders } from './folder.js';
import { checkoutOf } from '../../src/infra/internal.js';

const folder = folders();

const ann = {
  actor: { kind: 'user', id: 'ann', name: 'Ann' },
  identity: { name: 'Ann', email: 'ann@example.com' },
} as const;

function setSchemaVersion(path: string, version: number | undefined) {
  const configPath = join(path, '.cards', 'local', 'cardsConfig.json');
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));
  if (version === undefined) {
    delete config.schemaVersion;
  } else {
    config.schemaVersion = version;
  }
  writeFileSync(configPath, JSON.stringify(config, null, 4));
}

describe('openProjectAt', () => {
  it("gives the actor's handle over a checkout of its own", async () => {
    const { root } = await folder({ prefix: 'one' });
    const path = join(root, 'one');

    const ws = await openProjectAt(path, ann.actor, ann.identity);
    const other = await openProjectAt(path, ann.actor);
    expect([ws.path, ws.actor, ws.identity]).toEqual([
      path,
      ann.actor,
      ann.identity,
    ]);
    expect(checkoutOf(other)).not.toBe(checkoutOf(ws));
  });

  it('refuses a folder of projects', async () => {
    const { root } = await folder({ prefix: 'one' });

    await expect(openProjectAt(root, ann.actor)).rejects.toThrow(
      'is not a project',
    );
  });

  it.each([
    ['older', SCHEMA_VERSION - 1, "Run 'cyberismo migrate'"],
    ['newer', SCHEMA_VERSION + 1, 'Upgrade cyberismo'],
    ['missing', undefined, "no 'schemaVersion'"],
  ])(
    'refuses a project whose schema version is %s',
    async (_, version, message) => {
      const { root } = await folder({ prefix: 'one' });
      const path = join(root, 'one');
      setSchemaVersion(path, version);

      await expect(openProjectAt(path, ann.actor)).rejects.toThrow(message);
    },
  );
});
