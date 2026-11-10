// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { afterEach, expect, it } from 'vitest';

import { configureLogging } from '@cyberismo/node-common/log';
import { Workspace } from '../src/api/workspace.js';
import { Checkout } from '../src/state/checkout/checkout.js';
import { buildProject } from './helpers/project-builder.js';

afterEach(() => configureLogging([]));

it('logs from a module-level logger created before logging was configured', async () => {
  const project = await buildProject({ cards: [{ title: 'Alpha' }] });
  const records: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      records.push(JSON.parse(String(chunk)));
      done();
    },
  });
  try {
    // A card type that no longer resolves makes edit log a warning.
    await rm(join(project.path, '.cards', 'local', 'cardTypes'), {
      recursive: true,
    });
    const checkout = await Checkout.open(project.path);
    configureLogging([{ stream }]);
    const ws = Workspace.over(
      checkout,
      { kind: 'user', id: 'ann', name: 'Ann' },
      { name: 'Ann', email: 'ann@example.com' },
    );
    await ws.cards.editField(project.keys[0], 'title', 'x').catch(() => {});
    await checkout.dispose();
  } finally {
    await project.cleanup();
  }
  expect(records.some((r) => r.module === 'edit')).toBe(true);
});
