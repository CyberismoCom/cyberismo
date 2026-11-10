// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

// Where the built CLI sends its logs: stdout stays the command's result.

import { execFile } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { chmod, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildProject } from '../../data-handler/test/helpers/project-builder.js';

const bin = join(import.meta.dirname, '..', 'bin', 'run');

let project: string;
let home: string;

beforeEach(async () => {
  project = (await buildProject({ prefix: 'logt' })).path;
  home = await mkdtemp(join(tmpdir(), 'cyberismo-logging-home-'));
});

afterEach(async () => {
  await chmod(project, 0o755).catch(() => undefined);
  await rm(project, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
});

function showProject(...flags: string[]) {
  return new Promise<{ code: number; stdout: string; stderr: string }>(
    (resolve) => {
      execFile(
        process.execPath,
        [bin, ...flags, 'show', 'project', '-p', project],
        { env: { ...process.env, HOME: home, NO_COLOR: '1' } },
        (error, stdout, stderr) =>
          resolve({ code: error ? Number(error.code) : 0, stdout, stderr }),
      );
    },
  );
}

describe('CLI logging', () => {
  it('without -L nothing but the result reaches the terminal', async () => {
    const { stdout, stderr } = await showProject();

    expect(stderr).toBe('');
    expect(() => JSON.parse(stdout)).not.toThrow();
    expect(readdirSync(join(project, '.logs')).sort()).toEqual([
      '.gitignore',
      expect.stringMatching(/^cyberismo-\d{4}-\d{2}-\d{2}\.log$/),
    ]);
  }, 60_000);

  it('-L debug puts records on stderr and leaves stdout parseable', async () => {
    const { stdout, stderr } = await showProject('-L', 'debug');

    expect(() => JSON.parse(stdout)).not.toThrow();
    const lines = stderr.split('\n').filter((line) => line !== '');
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(JSON.parse(line).level).toBeGreaterThanOrEqual(20);
    }
  }, 60_000);

  it.skipIf(process.platform === 'win32')(
    'a read-only project still runs the command',
    async () => {
      await rm(join(project, '.logs'), { recursive: true, force: true });
      await chmod(project, 0o555);

      const { code } = await showProject();

      expect(code).toBe(0);
      expect(existsSync(join(project, '.logs'))).toBe(false);
    },
    60_000,
  );
});
