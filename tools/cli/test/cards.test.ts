// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

// The card commands' mapping: arguments to a Cards call, its result to
// stdout, its error to stderr and an exit code. Card behaviour is tested in
// data-handler's test/cards.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CommanderError } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CardNotFoundError } from '@cyberismo/data-handler';

import program from '../src/index.js';
import { exitCodeFor } from '../src/lib/errors.js';

const ws = vi.hoisted(() => ({
  cards: {} as Record<string, ReturnType<typeof vi.fn>>,
  atomic: (fn: () => Promise<unknown>) => fn(),
}));
vi.mock('../src/lib/open.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  openWorkspace: async () => ws,
}));
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => ({ status: 0 })),
}));

const card = () => ({ key: 'a', path: join('cards', 'a'), content: 'x' });
const json = (value: unknown) => JSON.stringify(value, null, 2);

// argv, Cards method, its arguments, its result, stdout
const TABLE: [string, string, unknown[], unknown, string][] = [
  ['move a b', 'move', ['a', 'b'], undefined, 'Done'],
  ['move a root', 'move', ['a', 'root'], undefined, 'Done'],
  ['rank card a first', 'rankFirst', ['a'], undefined, 'Done'],
  ['rank card a b', 'rank', ['a', 'b'], undefined, 'Done'],
  ['rank rebalance', 'rebalanceAll', [], undefined, 'Done'],
  ['rank rebalance a', 'rebalance', ['a'], undefined, 'Done'],
  ['transition a t', 'transition', ['a', 't'], undefined, 'Done'],
  ['edit a', 'details', ['a'], card(), 'Done'],
  ['create label a l', 'addLabel', ['a', 'l'], undefined, 'Done'],
  [
    'create link a b t',
    'addLink',
    ['a', 'b', 't', undefined],
    undefined,
    'Done',
  ],
  ['create link a b t d', 'addLink', ['a', 'b', 't', 'd'], undefined, 'Done'],
  [
    'create card tpl',
    'create',
    ['tpl', undefined],
    [{ key: 'k1' }],
    'Created cards ["k1"]',
  ],
  [
    'create card tpl p',
    'create',
    ['tpl', 'p'],
    [{ key: 'k1' }, { key: 'k2' }],
    'Created cards ["k1","k2"]',
  ],
  [
    'add card tpl ct',
    'addToTemplate',
    ['ct', 'tpl', undefined, undefined],
    ['k1'],
    "card 'k1' was added to the template 'tpl'",
  ],
  [
    'add card tpl ct p -r 2',
    'addToTemplate',
    ['ct', 'tpl', 'p', '2'],
    ['k1', 'k2'],
    `2 cards were added to the template 'tpl : ["k1","k2"]'`,
  ],
  ['remove card a', 'remove', ['a'], undefined, 'Done'],
  ['remove label a l', 'removeLabel', ['a', 'l'], undefined, 'Done'],
  [
    'remove link a b t',
    'removeLink',
    ['a', 'b', 't', undefined, undefined],
    undefined,
    'Done',
  ],
  ['remove attachment a f', 'removeAttachment', ['a', 'f'], undefined, 'Done'],
  [
    'show card a',
    'details',
    ['a'],
    card(),
    json({ ...card(), content: undefined }),
  ],
  ['show card a -d', 'details', ['a'], card(), json(card())],
  [
    'show test/cards/a',
    'details',
    ['test/cards/a'],
    card(),
    json({ ...card(), content: undefined }),
  ],
  ['show cards', 'list', [], [{ cards: ['a'] }], json([{ cards: ['a'] }])],
  ['show attachments', 'attachments', [], [], '[]'],
  ['show labels', 'labels', [], ['l'], json(['l'])],
];

let stdout: string;
let stderr: string;
let home: string;

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
  ws.cards = {};
  // 'edit' reads, or creates, the preferences in the home folder.
  home = mkdtempSync(join(tmpdir(), 'cyberismo-home-'));
  vi.stubEnv('HOME', home);
  vi.stubEnv('USERPROFILE', home);
  program
    .exitOverride()
    .configureOutput({ writeErr: (text) => (stderr += text) });
  vi.spyOn(console, 'log').mockImplementation(
    (text) => (stdout += `${text}\n`),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(home, { recursive: true, force: true });
});

describe('card commands', () => {
  it.each(TABLE)('%s calls %s', async (argv, method, args, result, out) => {
    ws.cards[method] = vi.fn(async () => structuredClone(result));

    expect(await cli(argv)).toBe(0);
    expect(ws.cards[method]).toHaveBeenCalledExactlyOnceWith(...args);
    expect({ stdout, stderr }).toEqual({ stdout: `${out}\n`, stderr: '' });
  });

  it.each(TABLE)('%s fails with the error of %s', async (argv, method) => {
    const error = new CardNotFoundError('a');
    ws.cards[method] = vi.fn(async () => {
      throw error;
    });

    expect(await cli(argv)).toBe(exitCodeFor(error.code));
    expect({ stdout, stderr }).toEqual({
      stdout: '',
      stderr: `${error.message}\n`,
    });
  });
});

describe('create attachment', () => {
  it("passes the file's bytes under its path", async () => {
    const file = join(home, 'note.txt');
    writeFileSync(file, 'bytes');
    ws.cards.addAttachment = vi.fn(async () => undefined);

    expect(await cli(`create attachment a ${file}`)).toBe(0);
    expect(ws.cards.addAttachment).toHaveBeenCalledExactlyOnceWith(
      'a',
      file,
      Buffer.from('bytes'),
    );
    expect(stdout).toBe('Done\n');
  });

  it('fails with the error of addAttachment', async () => {
    const file = join(home, 'note.txt');
    writeFileSync(file, 'bytes');
    const error = new CardNotFoundError('a');
    ws.cards.addAttachment = vi.fn(async () => {
      throw error;
    });
    expect(await cli(`create attachment a ${file}`)).toBe(1);
    expect(stderr).toBe(`${error.message}\n`);
  });

  it('refuses a file it cannot read', async () => {
    const file = join(home, 'nope.txt');
    ws.cards.addAttachment = vi.fn();

    expect(await cli(`create attachment a ${file}`)).toBe(1);
    expect(stderr).toBe(`Attachment file not found: ${file}\n`);
    expect(ws.cards.addAttachment).not.toHaveBeenCalled();
  });
});

describe('edit', () => {
  it("opens the card's files with the editor of cards.prefs.json", async () => {
    mkdirSync(join(home, '.cyberismo'));
    const args = ['{{cardDirPath}}', '{{cardContentPath}}', '{{cardJsonPath}}'];
    writeFileSync(
      join(home, '.cyberismo', 'cards.prefs.json'),
      JSON.stringify({
        editCommand: { [process.platform]: { command: 'ed', args } },
      }),
    );
    ws.cards.details = vi.fn(async () => card());

    expect(await cli('edit a')).toBe(0);
    const dir = card().path;
    expect(spawnSync).toHaveBeenCalledExactlyOnceWith(
      'ed',
      [dir, join(dir, 'index.adoc'), join(dir, 'index.json')],
      { stdio: 'inherit' },
    );
  });

  it('refuses an empty card key as a missing card', async () => {
    expect(await cli('edit ')).toBe(1);
    expect(stderr).toBe(`${new CardNotFoundError('').message}\n`);
  });
});
