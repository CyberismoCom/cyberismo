// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { afterEach, describe, expect, it, vi } from 'vitest';

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { configureLogging } from '@cyberismo/node-common/log';

import { runMigrationChain } from '../src/run-chain.js';

const testDir = join(import.meta.dirname, 'tmp-migration-log-tests');

describe('migration logging', () => {
  afterEach(() => {
    configureLogging([]);
    rmSync(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('a migration run prints nothing and logs its steps', async () => {
    const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    const lines: Array<{ module?: string; msg?: string }> = [];
    configureLogging([
      { stream: { write: (s: string) => lines.push(JSON.parse(s)) } },
    ]);
    const local = join(testDir, '.cards', 'local');
    mkdirSync(local, { recursive: true });
    writeFileSync(
      join(local, 'cardsConfig.json'),
      JSON.stringify({ schemaVersion: 1, modules: [] }),
    );

    await runMigrationChain(testDir, 1);

    expect(out).not.toHaveBeenCalled();
    expect(lines.some((l) => l.module === 'migrations')).toBe(true);
  });
});
