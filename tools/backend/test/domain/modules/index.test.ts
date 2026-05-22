/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CommandManager } from '@cyberismo/data-handler';

import { createApp } from '../../../src/app.js';
import { ProjectRegistry } from '../../../src/project-registry.js';
import { MockAuthProvider } from '../../../src/auth/mock.js';
import {
  createTempTestData,
  cleanupTempTestData,
} from '../../test-utils.js';

/**
 * Seed an installed module on disk: writes a `cardsConfig.json` with the
 * given `installedVersion` (the source of truth `previewUpdate` reads to
 * derive `fromVersion`) plus an empty sealed migration log for every
 * version in `sealedVersions`.
 */
async function seedInstalledModule(
  projectPath: string,
  modulePrefix: string,
  installedVersion: string,
  sealedVersions: string[],
): Promise<void> {
  const moduleRoot = join(projectPath, '.cards', 'modules', modulePrefix);
  await mkdir(join(moduleRoot, 'migrations'), { recursive: true });
  await writeFile(
    join(moduleRoot, 'cardsConfig.json'),
    JSON.stringify(
      {
        schemaVersion: 4,
        cardKeyPrefix: modulePrefix,
        name: modulePrefix,
        modules: [],
        hubs: [],
        version: installedVersion,
      },
      null,
      2,
    ),
  );
  for (const v of sealedVersions) {
    await writeFile(
      join(moduleRoot, 'migrations', `migrationLog_${v}.jsonl`),
      '',
    );
  }
}

// Note: end-to-end install+replay tests (POST /modules/update) live in
// data-handler under `test/mutations/module-update/` — they own the source
// layer plumbing. This file only covers the HTTP preview surface.
describe('POST /api/projects/:prefix/modules/update/preview', () => {
  let app: ReturnType<typeof createApp>;
  let tempPath: string;

  beforeEach(async () => {
    tempPath = await createTempTestData('decision-records');
  });

  afterEach(async () => {
    await cleanupTempTestData(tempPath);
  });

  it('returns the preview with a step and no conflicts for a real upgrade', async () => {
    await seedInstalledModule(tempPath, 'shared/foo', '1.0.0', [
      '1.0.0',
      '1.6.0',
    ]);

    const commands = await CommandManager.getInstance(tempPath);
    app = createApp(
      new MockAuthProvider(),
      ProjectRegistry.fromCommandManager(commands),
    );

    const res = await app.request(
      '/api/projects/decision/modules/update/preview',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module: 'shared/foo', toVersion: '1.6.0' }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      steps: Array<{ toVersion: string; fromVersion: string | null }>;
      conflicts: unknown[];
    };
    expect(body.steps).toHaveLength(1);
    expect(body.steps[0].toVersion).toBe('1.6.0');
    expect(body.steps[0].fromVersion).toBe('1.0.0');
    expect(body.conflicts).toHaveLength(0);
  });

  it('returns 200 with conflicts populated when the path is unreachable', async () => {
    // From 1.6.0 (top of major 1) to 2.0.0 — diverged-branch conflict.
    await seedInstalledModule(tempPath, 'shared/foo', '1.6.0', [
      '1.5.0',
      '1.6.0',
      '2.0.0',
    ]);

    const commands = await CommandManager.getInstance(tempPath);
    app = createApp(
      new MockAuthProvider(),
      ProjectRegistry.fromCommandManager(commands),
    );

    const res = await app.request(
      '/api/projects/decision/modules/update/preview',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module: 'shared/foo', toVersion: '2.0.0' }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      conflicts: Array<{ kind: string }>;
    };
    expect(body.conflicts.length).toBeGreaterThan(0);
    expect(body.conflicts[0].kind).toBe('migration_path_unreachable');
  });

  it('bootstraps with fromVersion=null when the module is not yet installed', async () => {
    const commands = await CommandManager.getInstance(tempPath);
    app = createApp(
      new MockAuthProvider(),
      ProjectRegistry.fromCommandManager(commands),
    );

    const res = await app.request(
      '/api/projects/decision/modules/update/preview',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module: 'shared/foo', toVersion: '1.0.0' }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      steps: Array<{ fromVersion: string | null }>;
    };
    expect(body.steps[0].fromVersion).toBeNull();
  });
});
