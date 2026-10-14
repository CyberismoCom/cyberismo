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

// The resource and settings commands' mapping: arguments to a workspace call,
// its result to stdout, its error to stderr and an exit code. Resource and
// settings behaviour is tested in data-handler's test/resources and
// test/settings.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CommanderError } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_HUB } from '@cyberismo/assets';
import { ResourceNotFoundError } from '@cyberismo/data-handler';

import program from '../src/index.js';
import { exitCodeFor } from '../src/lib/errors.js';

type Mock = ReturnType<typeof vi.fn>;
const ws = vi.hoisted(() => ({
  resources: {} as Record<string, Mock>,
  changes: {} as Record<string, Mock>,
  settings: { prefix: 'test', hubs: {} } as Record<string, unknown> & {
    hubs: Record<string, Mock>;
  },
  clean: {} as Record<string, Mock>,
  atomic: (fn: () => Promise<unknown>) => fn(),
  consistent: (fn: () => Promise<unknown>) => fn(),
}));
vi.mock('../src/lib/open.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  openWorkspace: async () => ws,
}));

// Sets the workspace method at a dotted path, e.g. 'settings.hubs.add'.
function stub(path: string, fn: Mock) {
  const keys = path.split('.');
  const method = keys.pop()!;
  const owner = keys.reduce(
    (object, key) => (object as Record<string, unknown>)[key],
    ws as unknown,
  ) as Record<string, unknown>;
  owner[method] = fn;
  return fn;
}

const json = (value: unknown) => JSON.stringify(value, null, 2);
const card = { prefix: 'test', type: 'cardTypes', identifier: 'c' };
const resource = { name: 'test/cardTypes/c', content: { x: 1 } };
const edit = (updateKey: object, operation: object) => ({
  kind: 'edit',
  target: card,
  updateKey,
  operation,
});

// argv, workspace method, its arguments, its result, stdout
const TABLE: [string, string, unknown[], unknown, string][] = [
  [
    'create cardType c wf',
    'resources.create',
    ['c', 'cardTypes', { workflow: 'wf' }],
    undefined,
    'Done',
  ],
  [
    'create fieldType f integer',
    'resources.create',
    ['f', 'fieldTypes', { dataType: 'integer' }],
    undefined,
    'Done',
  ],
  ...(
    [
      ['graphModel', 'graphModels'],
      ['graphView', 'graphViews'],
      ['calculation', 'calculations'],
      ['linkType', 'linkTypes'],
      ['report', 'reports'],
      ['skill', 'skills'],
    ] as const
  ).map(([command, type]): [string, string, unknown[], unknown, string] => [
    `create ${command} n`,
    'resources.create',
    ['n', type, {}],
    undefined,
    'Done',
  ]),
  [
    'create template t',
    'resources.create',
    ['t', 'templates', { content: undefined }],
    undefined,
    'Done',
  ],
  [
    'create workflow w {"a":1}',
    'resources.create',
    ['w', 'workflows', { content: { a: 1 } }],
    undefined,
    'Done',
  ],
  [
    'create resource test/cardTypes/c wf',
    'resources.create',
    ['test/cardTypes/c', 'cardTypes', { workflow: 'wf' }],
    undefined,
    'Done',
  ],
  [
    'create resource cardType c',
    'resources.create',
    ['c', 'cardTypes', { workflow: undefined }],
    undefined,
    'Done',
  ],
  [
    'update test/cardTypes/c change workflow a b',
    'changes.apply',
    [edit({ key: 'workflow' }, { name: 'change', target: 'a', to: 'b' })],
    undefined,
    'Done',
  ],
  [
    'update test/cardTypes/c change displayName x',
    'changes.apply',
    [
      edit(
        { key: 'displayName' },
        { name: 'change', target: undefined, to: 'x' },
      ),
    ],
    undefined,
    'Done',
  ],
  [
    'update test/cardTypes/c add customFields {"name":"f"}',
    'changes.apply',
    [edit({ key: 'customFields' }, { name: 'add', target: { name: 'f' } })],
    undefined,
    'Done',
  ],
  [
    'update test/cardTypes/c rank alwaysVisibleFields f 2',
    'changes.apply',
    [
      edit(
        { key: 'alwaysVisibleFields' },
        { name: 'rank', target: 'f', newIndex: 2 },
      ),
    ],
    undefined,
    'Done',
  ],
  [
    'update test/cardTypes/c remove alwaysVisibleFields f g',
    'changes.apply',
    [
      edit(
        { key: 'alwaysVisibleFields' },
        { name: 'remove', target: 'f', replacementValue: 'g' },
      ),
    ],
    undefined,
    'Done',
  ],
  [
    'update test/cardTypes/c change content/x a',
    'changes.apply',
    [
      edit(
        { key: 'content', subKey: 'x' },
        { name: 'change', target: undefined, to: 'a' },
      ),
    ],
    undefined,
    'Done',
  ],
  [
    'remove cardType c',
    'resources.remove',
    ['c', 'cardType'],
    undefined,
    'Done',
  ],
  [
    'remove test/workflows/w',
    'resources.remove',
    ['test/workflows/w', 'workflow'],
    undefined,
    'Done',
  ],
  ['remove hub h', 'settings.hubs.remove', ['h'], undefined, 'Done'],
  [
    'remove hub default',
    'settings.hubs.remove',
    [DEFAULT_HUB],
    undefined,
    'Done',
  ],
  [
    'add hub h',
    'settings.hubs.add',
    ['h'],
    undefined,
    "Hub 'h' was added to the project",
  ],
  [
    'add hub default',
    'settings.hubs.add',
    [DEFAULT_HUB],
    undefined,
    `Hub '${DEFAULT_HUB}' was added to the project`,
  ],
  [
    'show cardType test/cardTypes/c',
    'resources.show',
    ['test/cardTypes/c'],
    resource,
    json({ name: resource.name }),
  ],
  [
    'show test/cardTypes/c -d',
    'resources.show',
    ['test/cardTypes/c'],
    resource,
    json(resource),
  ],
  [
    'show cardTypes',
    'resources.list',
    ['cardTypes'],
    ['test/cardTypes/c'],
    json(['test/cardTypes/c']),
  ],
  ['show project', 'settings.info', [], { name: 'p' }, json({ name: 'p' })],
];

let stdout: string;
let stderr: string;
let dir: string;

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
  dir = mkdtempSync(join(tmpdir(), 'cyberismo-cli-'));
  stub(
    'clean.dormantSummary',
    vi.fn(async () => undefined),
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
  rmSync(dir, { recursive: true, force: true });
});

describe('resource and settings commands', () => {
  it.each(TABLE)('%s calls %s', async (argv, method, args, result, out) => {
    const call = stub(
      method,
      vi.fn(async () => structuredClone(result)),
    );

    expect(await cli(argv)).toBe(0);
    expect(call).toHaveBeenCalledExactlyOnceWith(...args);
    expect({ stdout, stderr }).toEqual({ stdout: `${out}\n`, stderr: '' });
  });

  it('show <resource> -u adds where it is used', async () => {
    stub(
      'resources.show',
      vi.fn(async () => structuredClone(resource)),
    );
    const usage = stub(
      'resources.usage',
      vi.fn(async () => ['test_a']),
    );

    expect(await cli('show cardType test/cardTypes/c -u')).toBe(0);
    expect(usage).toHaveBeenCalledExactlyOnceWith('test/cardTypes/c');
    expect(stdout).toBe(
      `${json({ name: resource.name, usedIn: ['test_a'] })}\n`,
    );
  });

  // The mapping from error to exit code is one path (onProject); one row per verb.
  const ERROR_ROWS = [
    'create cardType c wf',
    'update test/cardTypes/c change workflow a b',
    'remove cardType c',
    'show cardType test/cardTypes/c',
    'add hub h',
  ];
  it.each(TABLE.filter(([argv]) => ERROR_ROWS.includes(argv)))(
    '%s fails with the error of %s',
    async (argv, method) => {
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
    },
  );
});

describe('the clean note', () => {
  const note =
    "This project has 3 dormant field value(s) on 2 card(s) — run 'cyberismo clean --dry-run' to list them, 'cyberismo clean' to remove them";

  // argv, the card type the scan is limited to, or null for no scan
  it.each([
    ['update test/cardTypes/c remove customFields f', ['test/cardTypes/c']],
    ['update test/cardTypes/c change customFields f g', ['test/cardTypes/c']],
    ['update test/cardTypes/c add customFields f', null],
    ['update test/workflows/c remove customFields f', null],
    ['remove fieldType f', [undefined]],
    ['remove cardType c', null],
  ])('%s', async (argv, scan) => {
    stub(
      'changes.apply',
      vi.fn(async () => undefined),
    );
    stub(
      'resources.remove',
      vi.fn(async () => undefined),
    );
    const summary = stub(
      'clean.dormantSummary',
      vi.fn(async () => ({ valueCount: 3, cardCount: 2 })),
    );

    expect(await cli(argv)).toBe(0);
    if (scan) {
      expect(summary).toHaveBeenCalledExactlyOnceWith(...scan);
      expect(stdout).toBe(`Done\n\n${note}\n`);
    } else {
      expect(summary).not.toHaveBeenCalled();
      expect(stdout).toBe('Done\n');
    }
  });

  it('is left out when nothing is dormant', async () => {
    stub(
      'resources.remove',
      vi.fn(async () => undefined),
    );

    expect(await cli('remove fieldType f')).toBe(0);
    expect(stdout).toBe('Done\n');
  });
});

describe('remove', () => {
  it('refuses a type no remove handles, removing nothing', async () => {
    const remove = stub('resources.remove', vi.fn());

    // A singular type in a resource name maps to no removable type.
    expect(await cli('remove test/workflow/w')).toBe(1);
    expect({ stdout, stderr }).toEqual({
      stdout: '',
      stderr: "Unknown resource type 'workflo'\n",
    });
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('update', () => {
  it.each([
    [
      'a/b/c',
      "Invalid key format: a/b/c. Use 'property' or 'content/<property>'.",
    ],
    [
      'x/y',
      "Invalid key format: x/y. When using 'content', always use as 'content/<property>'.",
    ],
  ])('refuses the key %s', async (key, message) => {
    const apply = stub('changes.apply', vi.fn());

    expect(await cli(`update test/cardTypes/c change ${key} a`)).toBe(1);
    expect(stderr).toBe(`${message}\n`);
    expect(apply).not.toHaveBeenCalled();
  });

  it('passes the state mapping of a workflow change', async () => {
    const file = join(dir, 'mapping.json');
    writeFileSync(file, JSON.stringify({ stateMapping: { A: 'B' } }));
    const apply = stub(
      'changes.apply',
      vi.fn(async () => undefined),
    );

    expect(
      await cli(`update test/cardTypes/c change workflow a b -m ${file}`),
    ).toBe(0);
    expect(apply).toHaveBeenCalledExactlyOnceWith(
      edit(
        { key: 'workflow' },
        {
          name: 'change',
          target: 'a',
          to: 'b',
          mappingTable: { stateMapping: { A: 'B' } },
        },
      ),
    );
  });

  it('refuses a mapping file without a state mapping', async () => {
    const file = join(dir, 'mapping.json');
    writeFileSync(file, JSON.stringify({ other: {} }));
    const apply = stub('changes.apply', vi.fn());

    expect(
      await cli(`update test/cardTypes/c change workflow a b -m ${file}`),
    ).toBe(1);
    expect(stderr).toBe(
      'Failed to read mapping file: Mapping file must contain a "stateMapping" object\n',
    );
    expect(apply).not.toHaveBeenCalled();
  });
});
