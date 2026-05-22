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
import { CommandManager } from '@cyberismo/data-handler';

import { createApp } from '../../../src/app.js';
import { ProjectRegistry } from '../../../src/project-registry.js';
import { MockAuthProvider } from '../../../src/auth/mock.js';
import {
  createTempTestData,
  cleanupTempTestData,
} from '../../test-utils.js';

// Note: end-to-end install+replay coverage for `POST /modules/update`
// lives in data-handler under `test/mutations/module-update/` — those
// tests own the source-layer plumbing. This file covers HTTP-layer
// behavior (auth, schema validation, error envelope shape).
describe('POST /api/projects/:prefix/modules/update', () => {
  let app: ReturnType<typeof createApp>;
  let tempPath: string;

  beforeEach(async () => {
    tempPath = await createTempTestData('decision-records');
  });

  afterEach(async () => {
    await cleanupTempTestData(tempPath);
  });

  it('returns 400 on a malformed request body', async () => {
    const commands = await CommandManager.getInstance(tempPath);
    app = createApp(
      new MockAuthProvider(),
      ProjectRegistry.fromCommandManager(commands),
    );

    const res = await app.request('/api/projects/decision/modules/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module: 'foo' }), // missing toVersion
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('validation_error');
  });

  it('streams a cascade_failed error event when the module is not declared', async () => {
    const commands = await CommandManager.getInstance(tempPath);
    app = createApp(
      new MockAuthProvider(),
      ProjectRegistry.fromCommandManager(commands),
    );

    const res = await app.request('/api/projects/decision/modules/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module: 'shared/foo', toVersion: '1.0.0' }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let payload = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      payload += decoder.decode(value);
    }

    expect(payload).toMatch(/event: started/);
    expect(payload).toMatch(/event: error/);
    expect(payload).toMatch(/cascade_failed/);
    expect(payload).toMatch(/not part of the project/);
  });
});
