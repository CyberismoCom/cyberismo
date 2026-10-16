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

// The verb commands' mapping: arguments to a workspace call, its result to
// stdout, its error to stderr and an exit code. Their behaviour is tested in
// data-handler's test/{clean,queries,versions,modules}.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CommanderError } from 'commander';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { ResourceNotFoundError, Validate } from '@cyberismo/data-handler';

import program from '../src/index.js';
import { exitCodeFor } from '../src/lib/errors.js';

type Mock = ReturnType<typeof vi.fn>;
const ws = vi.hoisted(() => ({
  path: '/project',
  queries: {} as Record<string, Mock>,
  clean: {} as Record<string, Mock>,
  versions: {} as Record<string, Mock>,
  settings: {} as Record<string, Mock>,
  modules: {} as Record<string, Mock>,
  cards: {} as Record<string, Mock>,
  atomic: vi.fn((fn: () => Promise<unknown>) => fn()),
}));
vi.mock('../src/lib/open.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  openWorkspace: async () => ws,
}));
// The functions the CLI calls with the handle.
const functions = vi.hoisted(() => ({}) as Record<string, Mock>);
vi.mock('@cyberismo/data-handler', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  renameProject: (...args: unknown[]) => functions.renameProject(...args),
}));

// The commands the CLI creates rather than takes from the handle.
const commands: Record<string, object> = {
  Validate: Validate.getInstance(),
};

// Sets the function, or the workspace or command method at a dotted path,
// e.g. 'renameProject', 'queries.runReport' or 'Validate.validate'.
function stub(path: string, fn: Mock) {
  const [owner, method] = path.split('.') as [string, string?];
  if (method === undefined) {
    functions[owner] = fn;
    return fn;
  }
  if (owner in commands) {
    return vi
      .spyOn(commands[owner] as Record<string, Mock>, method)
      .mockImplementation(fn);
  }
  (ws[owner as keyof typeof ws] as Record<string, Mock>)[method] = fn;
  return fn;
}

const dir = mkdtempSync(join(tmpdir(), 'cyberismo-cli-'));
const programFile = join(dir, 'p.lp');
writeFileSync(programFile, 'a.');
const csvFile = join(dir, 'cards.csv');
const CSV = 'title,template\nA,t\n';
writeFileSync(csvFile, CSV);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const json = (value: unknown) => JSON.stringify(value, null, 2);
const cleanResult = (findings: object[], failedCards: string[] = []) => ({
  findings,
  skippedCards: [],
  failedCards,
});
const finding = (cardKey: string) => ({
  cardKey,
  field: 'f',
  reason: 'undeclared',
});
const PUBLISHED_NOTE =
  'Version 1.2.0 was published under the old prefix. The next version you ' +
  'publish is a new module: consumers must install it and remove the old ' +
  'one rather than update.';

// argv, workspace method, its arguments, its result, stdout
const TABLE: [string, string, unknown[], unknown, string][] = [
  [
    `calc run ${programFile}`,
    'queries.runLogicProgram',
    ['a.', 'commandLine'],
    { results: [] },
    json({ results: [] }),
  ],
  [
    `calc run ${programFile} -c exportedSite`,
    'queries.runLogicProgram',
    ['a.', 'exportedSite'],
    { results: [] },
    json({ results: [] }),
  ],
  ['clean', 'clean.run', [false], cleanResult([]), 'Nothing to clean'],
  [
    'clean --dry-run',
    'clean.run',
    [true],
    cleanResult([finding('a'), finding('a'), finding('b')]),
    '  a: f (undeclared)\n  a: f (undeclared)\n  b: f (undeclared)\n' +
      'Would remove 3 field value(s) from 2 card(s)',
  ],
  [
    'clean',
    'clean.run',
    [false],
    {
      ...cleanResult([finding('a'), finding('b')], ['b']),
      skippedCards: ['c'],
    },
    '  a: f (undeclared)\n  b: f (undeclared)\n' +
      'Removed 1 field value(s) from 1 card(s)\n' +
      'Skipped 1 card(s) with unresolvable card types: c\n' +
      'Could not update 1 card(s); their values were not removed: b',
  ],
  [
    'publish',
    'versions.publish',
    [false, undefined],
    { version: '1.0.0', dryRun: false },
    'Published v1.0.0',
  ],
  [
    'publish --dry-run --remote up',
    'versions.publish',
    [true, 'up'],
    { version: '1.0.0', dryRun: true, remote: 'up' },
    "Would publish v1.0.0 (create tag and push to remote 'up')",
  ],
  [
    'create version minor',
    'versions.bump',
    ['minor'],
    { newVersion: '1.1.0', previousVersion: '1.0.0' },
    'Bumped to v1.1.0 (was v1.0.0)',
  ],
  [
    'create version major',
    'versions.bump',
    ['major'],
    { newVersion: '1.0.0' },
    'Bumped to v1.0.0',
  ],
  [
    'validate',
    'Validate.validate',
    ['/project', expect.any(Function)],
    '',
    'Project structure validated',
  ],
  [
    'validate',
    'Validate.validate',
    ['/project', expect.any(Function)],
    'errors',
    'errors',
  ],
  [
    'rename p',
    'renameProject',
    [ws, 'p', { force: undefined }],
    undefined,
    'Done',
  ],
  [
    `import csv ${csvFile}`,
    'cards.importCsv',
    [CSV, undefined],
    ['a_1'],
    `Imported cards:\n${json(['a_1'])}`,
  ],
  [
    `import csv ${csvFile} a_2`,
    'cards.importCsv',
    [CSV, 'a_2'],
    [],
    `Imported cards:\n${json([])}`,
  ],
  ['fetch hubs', 'modules.fetchHubs', [true], [], 'Done'],
];

let stdout: string;
let stderr: string;

async function cli(argv: string) {
  stdout = stderr = '';
  try {
    await program.parseAsync(argv.split(' '), { from: 'user' });
    return 0;
  } catch (error) {
    if (error instanceof CommanderError) return error.exitCode;
    throw error;
  }
}

beforeEach(() => {
  stub(
    'settings.info',
    vi.fn(async () => ({ version: undefined })),
  );
  program
    .exitOverride()
    .configureOutput({ writeErr: (text) => (stderr += text) });
  vi.spyOn(console, 'log').mockImplementation(
    (text) => (stdout += `${text}\n`),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verb commands', () => {
  it.each(TABLE)('%s calls %s', async (argv, method, args, result, out) => {
    const call = stub(
      method,
      vi.fn(async () => structuredClone(result)),
    );

    expect(await cli(argv)).toBe(0);
    expect(call).toHaveBeenCalledExactlyOnceWith(...args);
    expect({ stdout, stderr }).toEqual({ stdout: `${out}\n`, stderr: '' });
  });

  // The mapping from error to exit code is one path (onProject); one row per verb.
  it.each([
    [`calc run ${programFile}`, 'queries.runLogicProgram'],
    ['clean', 'clean.run'],
    ['publish', 'versions.publish'],
    ['create version minor', 'versions.bump'],
    ['validate', 'Validate.validate'],
    ['rename p', 'renameProject'],
    [`import csv ${csvFile}`, 'cards.importCsv'],
    ['fetch hubs', 'modules.fetchHubs'],
  ])('%s fails with the error of %s', async (argv, method) => {
    const error = new ResourceNotFoundError('missing');
    stub(
      method,
      vi.fn(async () => {
        throw error;
      }),
    );

    expect(await cli(argv)).toBe(exitCodeFor(error.code));
    expect({ stdout, stderr }).toEqual({
      stdout: '',
      stderr: `${error.message}\n`,
    });
  });
});

describe('rename', () => {
  it('notes a version published under the old prefix', async () => {
    stub(
      'settings.info',
      vi.fn(async () => ({ version: '1.2.0' })),
    );
    const rename = stub(
      'renameProject',
      vi.fn(async () => undefined),
    );

    expect(await cli('rename p --force')).toBe(0);
    expect(rename).toHaveBeenCalledExactlyOnceWith(ws, 'p', { force: true });
    expect(stdout).toBe(`Done\n\n${PUBLISHED_NOTE}\n`);
  });
});

describe('import csv', () => {
  it('reads the file inside a write named after it', async () => {
    const importCsv = stub(
      'cards.importCsv',
      vi.fn(async () => []),
    );
    ws.atomic.mockClear();

    expect(await cli(`import csv ${csvFile}`)).toBe(0);
    expect(ws.atomic).toHaveBeenCalledExactlyOnceWith(
      expect.any(Function),
      `Import cards from CSV ${csvFile}`,
    );
    expect(importCsv).toHaveBeenCalledOnce();
  });

  it('fails, inside the write, naming a file it cannot read', async () => {
    const importCsv = stub('cards.importCsv', vi.fn());
    ws.atomic.mockClear();
    const missing = join(dir, 'missing.csv');

    expect(await cli(`import csv ${missing}`)).toBe(1);
    // Inside the write, so a refusal rolls it back as any other would.
    expect(ws.atomic).toHaveBeenCalledOnce();
    expect(importCsv).not.toHaveBeenCalled();
    expect({ stdout, stderr }).toEqual({
      stdout: '',
      stderr: `ENOENT: no such file or directory, open '${missing}'\n`,
    });
  });
});

describe('fetch hubs', () => {
  it('fails naming the hubs it could not read', async () => {
    stub(
      'modules.fetchHubs',
      vi.fn(async () => [
        { location: 'https://a', message: 'down' },
        { location: 'https://b', message: 'gone' },
      ]),
    );

    expect(await cli('fetch hubs')).toBe(1);
    expect({ stdout, stderr }).toEqual({
      stdout: '',
      stderr:
        'https://a: down\nhttps://b: gone\n' +
        'Modules from the hubs that could be read were refreshed.\n',
    });
  });
});
