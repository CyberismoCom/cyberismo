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
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CommandManager } from '@cyberismo/data-handler';

import { createApp } from '../../../src/app.js';
import { ProjectRegistry } from '../../../src/project-registry.js';
import { MockAuthProvider } from '../../../src/auth/mock.js';
import {
  createTempTestData,
  cleanupTempTestData,
} from '../../test-utils.js';

describe('POST /api/projects/:prefix/mutations/preview', () => {
  let app: ReturnType<typeof createApp>;
  let tempPath: string;

  beforeEach(async () => {
    tempPath = await createTempTestData('decision-records');

    // Seed a link so the rename cascade has something to rewrite.
    const decision5Path = join(tempPath, 'cardRoot', 'decision_5', 'index.json');
    const decision5 = JSON.parse(await readFile(decision5Path, 'utf-8'));
    decision5.links = [
      { linkType: 'decision/linkTypes/test', cardKey: 'decision_6' },
    ];
    await writeFile(decision5Path, JSON.stringify(decision5, null, 4));

    const commands = await CommandManager.getInstance(tempPath);
    app = createApp(
      new MockAuthProvider(),
      ProjectRegistry.fromCommandManager(commands),
    );
  });

  afterEach(async () => {
    await cleanupTempTestData(tempPath);
  });

  it('returns isBreaking, preview, and fingerprint', async () => {
    const res = await app.request(
      '/api/projects/decision/mutations/preview',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: {
            kind: 'rename',
            target: {
              prefix: 'decision',
              type: 'linkTypes',
              identifier: 'test',
            },
            newIdentifier: 'is-caused-by',
          },
        }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      isBreaking: boolean;
      fingerprint: { digest: string };
      preview: { affectedLinkCount: number };
    };
    expect(body.isBreaking).toBe(true);
    expect(body.fingerprint.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(body.preview.affectedLinkCount).toBeGreaterThan(0);
  });

  it('returns 400 with validation_error on malformed input', async () => {
    const res = await app.request(
      '/api/projects/decision/mutations/preview',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: { kind: 'unknown' } }),
      },
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('validation_error');
  });
});
