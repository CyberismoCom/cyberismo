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

interface AppliedModule {
  prefix: string;
  installedVersion: string;
  appliedVersion: string;
}

async function seedInstalledModule(
  projectPath: string,
  modulePrefix: string,
  sealedVersions: string[],
): Promise<void> {
  const moduleFolder = join(
    projectPath,
    '.cards',
    'modules',
    modulePrefix,
    'migrations',
  );
  await mkdir(moduleFolder, { recursive: true });
  for (const v of sealedVersions) {
    await writeFile(join(moduleFolder, `migrationLog_${v}.jsonl`), '');
  }
}

async function writeAppliedModulesFile(
  projectPath: string,
  modules: AppliedModule[],
): Promise<void> {
  const path = join(projectPath, '.cards', 'local', 'appliedModules.json');
  await writeFile(path, JSON.stringify({ modules }, null, 2));
}

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
    await seedInstalledModule(tempPath, 'shared/foo', ['1.0.0', '1.6.0']);
    await writeAppliedModulesFile(tempPath, [
      {
        prefix: 'shared/foo',
        installedVersion: '1.0.0',
        appliedVersion: '1.0.0',
      },
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
      steps: Array<{ toVersion: string }>;
      conflicts: unknown[];
    };
    expect(body.steps).toHaveLength(1);
    expect(body.steps[0].toVersion).toBe('1.6.0');
    expect(body.conflicts).toHaveLength(0);
  });

  it('streams progress events and completes', async () => {
    await seedInstalledModule(tempPath, 'shared/foo', ['1.0.0', '1.6.0']);
    await writeAppliedModulesFile(tempPath, [
      {
        prefix: 'shared/foo',
        installedVersion: '1.0.0',
        appliedVersion: '1.0.0',
      },
    ]);

    const commands = await CommandManager.getInstance(tempPath);
    app = createApp(
      new MockAuthProvider(),
      ProjectRegistry.fromCommandManager(commands),
    );

    const res = await app.request('/api/projects/decision/modules/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module: 'shared/foo', toVersion: '1.6.0' }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);

    // Consume the stream.
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let payload = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      payload += decoder.decode(value);
    }

    expect(payload).toMatch(/event: step\.started/);
    expect(payload).toMatch(/event: step\.completed/);
    expect(payload).toMatch(/event: complete/);
  });

  it('returns 200 with conflicts populated when the path is unreachable', async () => {
    // From 1.6.0 (top of major 1) to 2.0.0 — diverged-branch conflict.
    await seedInstalledModule(tempPath, 'shared/foo', [
      '1.5.0',
      '1.6.0',
      '2.0.0',
    ]);
    await writeAppliedModulesFile(tempPath, [
      {
        prefix: 'shared/foo',
        installedVersion: '1.6.0',
        appliedVersion: '1.6.0',
      },
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
});
