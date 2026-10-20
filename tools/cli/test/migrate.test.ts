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

// 'migrate' end to end: output and exit code of the built binary.

import { execFile } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildProject } from '../../data-handler/test/helpers/project-builder.js';

const bin = join(import.meta.dirname, '..', 'bin', 'run');

let path: string;
// The schema version the builder writes: the tool's.
let current: number;

beforeEach(async () => {
  path = (await buildProject({})).path;
  current = (await readConfig()).schemaVersion;
});

afterEach(async () => {
  await rm(path, { recursive: true, force: true });
});

function run(cwd: string, args: string[]) {
  return new Promise<{ code: number; stdout: string; stderr: string }>(
    (resolve) => {
      execFile(
        process.execPath,
        [bin, ...args],
        { cwd, env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: undefined } },
        (error, stdout, stderr) => {
          const code = error ? Number(error.code) : 0;
          resolve({
            code,
            stdout,
            stderr: stderr.replaceAll(path, '<project>'),
          });
        },
      );
    },
  );
}

const configFile = () => join(path, '.cards', 'local', 'cardsConfig.json');
const readConfig = async () =>
  JSON.parse(await readFile(configFile(), 'utf-8'));

async function setSchemaVersion(version: unknown) {
  const content = await readConfig();
  content.schemaVersion = version;
  await writeFile(configFile(), JSON.stringify(content, null, 4));
}

describe('migrate', () => {
  it.each([
    ['migrates an older project', () => setSchemaVersion(current - 1), []],
    ['leaves a current project as it is', async () => {}, []],
    [
      'refuses a project without a schema version',
      () => setSchemaVersion(undefined),
      [],
    ],
    [
      'refuses a path that is not a project',
      async () => {},
      ['-p', 'cardRoot'],
    ],
  ])(
    '%s',
    async (_, arrange, options) => {
      await arrange();

      expect(await run(path, ['migrate', ...options])).toMatchSnapshot();
    },
    60_000,
  );
});
