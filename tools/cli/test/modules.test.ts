// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

// The module and hub commands' mapping: arguments to a ws.modules call, its
// result to stdout and stderr, its error to stderr and an exit code. Module
// behaviour is tested in data-handler's test/modules.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CommanderError } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ModuleRequestError,
  ModuleValidationFailedError,
} from '@cyberismo/data-handler';
import type { UpdatePlan } from '@cyberismo/model';

import program from '../src/index.js';
import { exitCodeFor } from '../src/lib/errors.js';
import { renderUpdatePlan } from '../src/update-plan-lines.js';

type Mock = ReturnType<typeof vi.fn>;
const ws = vi.hoisted(() => ({
  modules: {} as Record<string, Mock>,
  settings: { hubs: {} as Record<string, Mock> },
  clean: {} as Record<string, Mock>,
}));
vi.mock('../src/lib/open.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  openWorkspace: async () => ws,
}));
const createProject = vi.hoisted(() => vi.fn());
vi.mock('@cyberismo/data-handler', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createProject,
}));
const prompts = vi.hoisted(() => ({ select: vi.fn(), checkbox: vi.fn() }));
vi.mock('../src/lib/prompts.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...prompts,
}));

const stub = (method: string, fn: Mock) => (ws.modules[method] = fn);

const json = (value: unknown) => JSON.stringify(value, null, 2);
const credentials = {
  username: process.env.CYBERISMO_GIT_USER,
  token: process.env.CYBERISMO_GIT_TOKEN,
};
const installed = {
  replayed: [],
  skippedReplays: [],
  newValidationErrors: false,
};
const updated = { replayed: [], skippedReplays: [] };
const plan: UpdatePlan = {
  ok: true,
  changes: [{ module: 'm', from: '1.0.0', to: '1.1.0', breaking: false }],
  removed: [],
  conflicts: [],
  rangeWrites: [],
  roots: [],
};
const deprecated = (from: string, to: string) =>
  `Warning: 'cyberismo ${from}' is deprecated. Use 'cyberismo ${to}' instead.\n`;

// argv, ws.modules method, its arguments, its result, stdout, stderr
const TABLE: [string, string, unknown[], unknown, string, string][] = [
  [
    'module install src',
    'install',
    ['src', { private: undefined, credentials, version: undefined }],
    installed,
    'Done',
    '',
  ],
  [
    'module install src@^1.0.0 true',
    'install',
    ['src', { private: true, credentials, version: '^1.0.0' }],
    installed,
    'Done',
    '',
  ],
  [
    'module install src false',
    'install',
    ['src', { private: false, credentials, version: undefined }],
    installed,
    'Done',
    '',
  ],
  [
    'import module src',
    'install',
    ['src', { private: undefined, credentials, version: undefined }],
    installed,
    'Done',
    deprecated('import module', 'module install'),
  ],
  ['module update', 'update', [{}, credentials], updated, 'Done', ''],
  [
    'module update m 2.0.0',
    'update',
    [{ module: 'm', version: '2.0.0' }, credentials],
    updated,
    'Done',
    '',
  ],
  [
    'update-modules m',
    'update',
    [{ module: 'm', version: undefined }, credentials],
    updated,
    'Done',
    deprecated('update-modules', 'module update'),
  ],
  [
    'module update --dry-run m',
    'planUpdate',
    [{ module: 'm', version: undefined }, credentials],
    plan,
    renderUpdatePlan(plan).lines.join('\n'),
    '',
  ],
  [
    'check-updates',
    'planUpdate',
    [{}, credentials],
    plan,
    renderUpdatePlan(plan).lines.join('\n'),
    deprecated('check-updates', 'module update --dry-run'),
  ],
  ['module remove m', 'remove', ['m'], undefined, 'Done', ''],
  [
    'remove module m',
    'remove',
    ['m'],
    undefined,
    'Done',
    deprecated('remove module', 'module remove'),
  ],
  ['module list', 'list', [], [{ name: 'm' }], json([{ name: 'm' }]), ''],
  [
    'show modules',
    'list',
    [],
    [{ name: 'm' }],
    json([{ name: 'm' }]),
    deprecated('show modules', 'module list'),
  ],
  [
    'show module m',
    'show',
    ['m'],
    { name: 'm', content: 'x' },
    json({ name: 'm' }),
    '',
  ],
  [
    'show module m -d',
    'show',
    ['m'],
    { name: 'm', content: 'x' },
    json({ name: 'm', content: 'x' }),
    '',
  ],
  ['show hubs', 'hubs', [], [{ location: 'h' }], json([{ location: 'h' }]), ''],
  [
    'show importableModules',
    'importable',
    [undefined, undefined],
    ['m'],
    json(['m']),
    '',
  ],
  [
    'show importableModules -a -d',
    'importable',
    [true, true],
    ['m'],
    json(['m']),
    '',
  ],
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
    'ensureModuleListUpToDate',
    vi.fn(async () => []),
  );
  ws.clean.dormantSummary = vi.fn(async () => undefined);
  program
    .exitOverride()
    .configureOutput({ writeErr: (text) => (stderr += text) });
  vi.spyOn(console, 'log').mockImplementation(
    (text) => (stdout += `${text}\n`),
  );
  for (const stream of ['warn', 'error'] as const) {
    vi.spyOn(console, stream).mockImplementation(
      (...text) => (stderr += `${text.join(' ')}\n`),
    );
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

describe('module commands', () => {
  it.each(TABLE)(
    '%s calls %s',
    async (argv, method, args, result, out, err) => {
      const call = stub(
        method,
        vi.fn(async () => structuredClone(result)),
      );

      expect(await cli(argv)).toBe(0);
      expect(call).toHaveBeenCalledExactlyOnceWith(...args);
      expect({ stdout, stderr }).toEqual({ stdout: `${out}\n`, stderr: err });
    },
  );

  it.each([
    ['show hubs', 'hubs'],
    ['show importableModules', 'importable'],
  ])('%s refreshes the module list before listing', async (argv, method) => {
    const list = stub(
      method,
      vi.fn(async () => []),
    );

    expect(await cli(argv)).toBe(0);
    expect(ws.modules.ensureModuleListUpToDate).toHaveBeenCalledBefore(list);
  });

  it('fails a blocked dry run after printing it', async () => {
    const blocked: UpdatePlan = {
      ...plan,
      ok: false,
      conflicts: [{ module: 'm', reason: 'r' }],
    };
    stub(
      'planUpdate',
      vi.fn(async () => blocked),
    );

    expect(await cli('module update --dry-run')).toBe(0);
    expect(process.exitCode).toBe(1);
    expect(stdout).toBe(`${renderUpdatePlan(blocked).lines.join('\n')}\n`);
  });

  it('refuses a target version without a module name', async () => {
    const update = stub('update', vi.fn());

    expect(await cli('module update  1.0.0')).toBe(
      exitCodeFor('module-request'),
    );
    expect(update).not.toHaveBeenCalled();
    expect(stderr).toBe(
      'A target version can only be specified together with a module name\n',
    );
  });

  // One row per command: install, update, dry run and remove share the mapping.
  it.each([
    ['module install src', 'install'],
    ['module update', 'update'],
    ['module update --dry-run', 'planUpdate'],
    ['module remove m', 'remove'],
  ])('%s fails with the message and git detail', async (argv, method) => {
    const error = new ModuleRequestError("Couldn't fetch module", 'fatal: x');
    stub(
      method,
      vi.fn(async () => {
        throw error;
      }),
    );

    expect(await cli(argv)).toBe(exitCodeFor(error.code));
    expect({ stdout, stderr }).toEqual({
      stdout: '',
      stderr: "Couldn't fetch module\nfatal: x\n",
    });
  });

  it.each([
    ['module install src', 'install', installed],
    ['module update', 'update', updated],
  ])('%s gives the clean note', async (argv, method, result) => {
    stub(
      method,
      vi.fn(async () => result),
    );
    ws.clean.dormantSummary = vi.fn(async () => ({
      valueCount: 3,
      cardCount: 2,
    }));

    expect(await cli(argv)).toBe(0);
    expect(ws.clean.dormantSummary).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(stdout).toBe(
      "Done\n\nThis project has 3 dormant field value(s) on 2 card(s) — run 'cyberismo clean --dry-run' to list them, 'cyberismo clean' to remove them\n",
    );
  });

  it('installs the module picked from the hubs, as private as the hub says', async () => {
    stub(
      'importable',
      vi.fn(async () => [{ name: 'm', location: 'git:m', private: true }]),
    );
    prompts.select.mockImplementation(async ({ choices }) => choices[0].value);
    const install = stub(
      'install',
      vi.fn(async () => installed),
    );

    expect(await cli('module install')).toBe(0);
    expect(ws.modules.importable).toHaveBeenCalledExactlyOnceWith(
      undefined,
      true,
    );
    expect(install).toHaveBeenCalledExactlyOnceWith('git:m', {
      private: true,
      credentials,
      version: undefined,
    });
  });
});

describe('module results', () => {
  const replayed = {
    modulePrefix: 'm',
    fromVersion: '1.0.0',
    toVersion: '2.0.0',
    seals: 2,
    retired: ['a', 'a'],
    unknown: ['b'],
    foreign: ['x/cardTypes/c'],
  };
  const skipped = {
    modulePrefix: 's',
    fromVersion: '1.0.0',
    toVersion: '1.1.0',
  };
  const SKIPPED =
    "Skipping migration replay for module 's' (1.0.0 -> 1.1.0): the module failed to apply.\n";
  const REPLAYED =
    "Replayed migrations for module 'm': 1.0.0 -> 2.0.0 (2 seal(s)); " +
    'ignored 2 entries for retired operations (a); skipped 1 entry ' +
    'this version does not recognise (b) — upgrade cyberismo to apply it; ' +
    'skipped 1 entry targeting resources outside the module (x/cardTypes/c)\n';
  const INVALID =
    'There are new validations errors after importing the module. Check the project\n';

  it.each([
    ['module install src', 'install', true],
    ['module update', 'update', false],
  ])(
    '%s prints skipped and replayed migrations',
    async (argv, method, install) => {
      stub(
        method,
        vi.fn(async () => ({
          replayed: [replayed],
          skippedReplays: [skipped],
          ...(install ? { newValidationErrors: true } : {}),
        })),
      );

      expect(await cli(argv)).toBe(0);
      expect({ stdout, stderr }).toEqual({
        stdout: `${REPLAYED}Done\n`,
        stderr: `${SKIPPED}${install ? INVALID : ''}`,
      });
    },
  );

  it.each([
    ['module install src', 'install'],
    ['module update', 'update'],
  ])(
    '%s prints what ran before a module error, then fails',
    async (argv, method) => {
      const error = new ModuleValidationFailedError('invalid', [], {
        replayed: [replayed],
        skippedReplays: [skipped],
      });
      stub(
        method,
        vi.fn(async () => {
          throw error;
        }),
      );

      expect(await cli(argv)).toBe(exitCodeFor(error.code));
      expect({ stdout, stderr }).toEqual({
        stdout: REPLAYED,
        stderr: `${SKIPPED}${error.message}\n`,
      });
    },
  );
});

describe('create project', () => {
  it('creates the project with the default hub, prints its warnings and installs the picked modules', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cyberismo-cli-'));
    try {
      createProject.mockResolvedValue({
        path: join(dir, 'p'),
        prefix: 'proj',
        failures: [],
        warnings: ['Could not fetch hub data - h: down'],
      });
      stub(
        'importable',
        vi.fn(async () => [
          { name: 'a', location: 'git:a', private: true },
          { name: 'b', location: 'git:b' },
        ]),
      );
      prompts.checkbox.mockImplementation(async ({ choices }) =>
        choices.map((choice: { value: unknown }) => choice.value),
      );
      const install = stub(
        'install',
        vi.fn(async (source: string) => {
          if (source === 'git:b') throw new Error('broken');
          return installed;
        }),
      );

      expect(await cli(`create project n proj ${join(dir, 'p')}`)).toBe(0);
      expect(createProject.mock.calls[0].slice(0, 2)).toEqual([
        join(dir, 'p'),
        {
          name: 'n',
          prefix: 'proj',
          category: '',
          description: '',
          skipDefaultHub: false,
        },
      ]);
      expect(install.mock.calls).toEqual([
        ['git:a', { private: true }],
        ['git:b', { private: false }],
      ]);
      expect({ stdout, stderr }).toEqual({
        stdout: 'Done\n',
        stderr:
          'Could not fetch hub data - h: down\n' +
          "Failed to import module 'b': broken\n" +
          '\nSome modules failed to import: b\n',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
