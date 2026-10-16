// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

// The 'app' command's startup: which folder it serves and how it reports the
// projects it cannot start. The server itself is not started.

import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import program from '../src/index.js';

const startServer = vi.hoisted(() => vi.fn());
vi.mock('@cyberismo/backend', () => ({
  startServer,
  MockAuthProvider: class {},
}));
vi.mock('../src/lib/prompts.js', () => ({ confirm: async () => true }));

const minimal = join(
  import.meta.dirname,
  '../../data-handler/test/test-data/valid/minimal',
);

describe('app', () => {
  let root: string;
  let stderr: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cyberismo-app-'));
    cpSync(minimal, join(root, 'mini'), { recursive: true });
    stderr = '';
    vi.spyOn(console, 'error').mockImplementation((text) => (stderr += text));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    startServer.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  const app = (path: string) =>
    program.parseAsync(['node', 'cyberismo', 'app', '-p', path]);

  it('serves a project folder as a single project', async () => {
    await app(join(root, 'mini'));

    expect(startServer.mock.calls[0][3]).toBeUndefined();
  });

  it('serves a collection as its root', async () => {
    await app(root);

    expect(startServer.mock.calls[0][3]).toBe(root);
  });

  it("reports a project it cannot load by the load's own error", async () => {
    cpSync(minimal, join(root, 'new'), { recursive: true });
    writeFileSync(
      join(root, 'new', '.cards', 'local', 'cardsConfig.json'),
      JSON.stringify({ schemaVersion: 999, cardKeyPrefix: 'new', name: 'New' }),
    );

    await app(root);

    expect(stderr).toMatch(
      /^1 project has errors:\n\nnew \(1\):\n {2}Schema version mismatch: project is at schema version 999, this tool supports up to \d+\. Upgrade cyberismo\.$/,
    );
  });

  it('reports a project whose folder name is invalid by that alone', async () => {
    cpSync(minimal, join(root, 'con'), { recursive: true });
    writeFileSync(
      join(root, 'con', '.cards', 'local', 'cardsConfig.json'),
      JSON.stringify({ schemaVersion: 5, cardKeyPrefix: 'con', name: 'Con' }),
    );

    await app(root);

    expect(stderr).toBe(
      `1 project has errors:\n\ncon (1):\n  Input validation error: folder name '${join(root, 'con')}' is invalid`,
    );
  });
});
