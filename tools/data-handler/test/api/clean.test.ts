// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it, vi } from 'vitest';

import type * as CardUpdate from '../../src/domain/cards/update.js';
import { sortCards } from '../../src/shared/utils/card-utils.js';
import { openTestWorkspace } from '../helpers/open-test-workspace.js';
import { metadataOf, projects, snapshot } from '../domain/cards/fixture.js';
import { checkoutOf } from '../../src/state/checkout/internal.js';

// The card keys whose metadata write is to fail; see 'failedCards'.
const failing = vi.hoisted(() => new Set<string>());
vi.mock('../../src/domain/cards/update.js', async (importOriginal) => {
  const actual = await importOriginal<typeof CardUpdate>();
  return {
    ...actual,
    updateCardMetadata: (
      ...args: Parameters<typeof actual.updateCardMetadata>
    ) => {
      if (failing.has(args[1].key)) throw new Error('disk full');
      return actual.updateCardMetadata(...args);
    },
  };
});

const open = projects();
const git = async (path: string, ...args: string[]) =>
  (await promisify(execFile)('git', args, { cwd: path })).stdout.trim();

const stale = { 'test/fieldTypes/spare': 'stale' };
const spec = {
  fieldTypes: [
    { name: 'size', dataType: 'integer' },
    { name: 'spare', dataType: 'shortText' },
  ],
  cardTypes: [{ name: 'page', customFields: [{ name: 'size' }] }],
  cards: [
    { title: 'A', fields: { ...stale, 'test/fieldTypes/size': 1 } },
    { title: 'B', labels: ['keep'], fields: stale },
    { title: 'C', fields: stale },
    { title: 'Clean', fields: { 'test/fieldTypes/size': 2 } },
  ],
};

describe('clean.run', () => {
  it('lists the findings and the cards in card key order', async () => {
    const { ws, keys } = await open(spec);

    const result = await ws.clean.run(true);

    const dirty = keys.slice(0, 3).sort(sortCards);
    expect(result.findings.map((finding) => finding.cardKey)).toEqual(dirty);
    expect(result.cardCount).toBe(3);
  });

  it('removes only the dormant values and nothing a card keeps', async () => {
    const { ws, keys } = await open(spec);
    const before = await metadataOf(ws, keys[0]);

    await ws.clean.run(false);

    const expected: Record<string, unknown> = {
      ...before,
      lastUpdated: expect.any(String),
    };
    delete expected['test/fieldTypes/spare'];
    expect(await metadataOf(ws, keys[0])).toEqual(expected);
    expect((await metadataOf(ws, keys[1])).labels).toEqual(['keep']);
    expect((await ws.clean.run(false)).findings).toEqual([]);
  });

  it('writes nothing for a card without dormant values', async () => {
    const { ws, path, keys } = await open(spec);
    const file = join('cardRoot', keys[3], 'index.json');
    const before = snapshot(path)[file];

    await ws.clean.run(false);

    expect(snapshot(path)[file]).toBe(before);
  });

  it('skips a card whose card type cannot be resolved, and leaves it as it is', async () => {
    const { path, keys } = await open(spec);
    const file = join(path, 'cardRoot', keys[0], 'index.json');
    const metadata = JSON.parse(readFileSync(file, 'utf-8'));
    writeFileSync(
      file,
      JSON.stringify({ ...metadata, cardType: 'test/cardTypes/gone' }),
    );
    const reopened = await openTestWorkspace(path);
    const before = snapshot(path);

    const result = await reopened.clean.run(false);

    expect(result.skippedCards).toEqual([keys[0]]);
    expect(result.findings.map((finding) => finding.cardKey)).not.toContain(
      keys[0],
    );
    expect(snapshot(path)[join('cardRoot', keys[0], 'index.json')]).toBe(
      before[join('cardRoot', keys[0], 'index.json')],
    );
  });

  describe('when a card cannot be written', () => {
    it('lists it as failed and cleans the other cards', async () => {
      const { ws, path, keys } = await open(spec);
      const file = join('cardRoot', keys[1], 'index.json');
      const before = snapshot(path)[file];
      failing.add(keys[1]);

      try {
        const result = await ws.clean.run(false);

        expect(result.failedCards).toEqual([keys[1]]);
        expect(result.findings.map((finding) => finding.cardKey)).toContain(
          keys[1],
        );
      } finally {
        failing.clear();
      }
      expect(snapshot(path)[file]).toBe(before);
      expect(await metadataOf(ws, keys[0])).not.toHaveProperty(
        Object.keys(stale),
      );
      expect(await metadataOf(ws, keys[2])).not.toHaveProperty(
        Object.keys(stale),
      );
    });

    it('is finished by running it again', async () => {
      const { ws, keys } = await open(spec);
      failing.add(keys[1]);
      try {
        await ws.clean.run(false);
      } finally {
        failing.clear();
      }

      const again = await ws.clean.run(false);

      expect(again.failedCards).toEqual([]);
      expect(again.findings.map((finding) => finding.cardKey)).toContain(
        keys[1],
      );
      expect((await ws.clean.run(true)).findings).toEqual([]);
    });

    it('commits the partial clean under autocommit instead of rolling it back', async () => {
      const { ws, path, keys } = await open(
        { ...spec, git: true },
        { autocommit: true },
      );
      failing.add(keys[1]);
      try {
        await ws.clean.run(false);
      } finally {
        failing.clear();
      }

      expect(await git(path, 'log', '-1', '--format=%s')).toBe(
        'Remove dormant field values',
      );
      expect(await git(path, 'status', '--porcelain')).toBe('');
      expect(await metadataOf(ws, keys[0])).not.toHaveProperty(
        Object.keys(stale),
      );
    });
  });

  it('takes only the read lock in a dry run: no write hooks, and it nests in a read', async () => {
    const { ws } = await open(spec);
    const afterWrite = vi.fn().mockResolvedValue(undefined);
    checkoutOf(ws).lock.onAfterWrite(afterWrite);

    const nested = await checkoutOf(ws).lock.read(() => ws.clean.run(true));
    expect(nested.findings).not.toEqual([]);
    expect(afterWrite).not.toHaveBeenCalled();

    await ws.clean.run(false);
    expect(afterWrite).toHaveBeenCalled();
  });

  it('leaves HEAD and an uncommitted edit alone in a dry run under autocommit', async () => {
    const { ws, path, keys } = await open(
      { ...spec, git: true },
      { autocommit: true },
    );
    writeFileSync(join(path, 'cardRoot', keys[3], 'index.adoc'), 'edited');
    const head = await git(path, 'rev-parse', 'HEAD');
    const status = await git(path, 'status', '--porcelain');

    await ws.clean.run(true);

    expect(await git(path, 'rev-parse', 'HEAD')).toBe(head);
    expect(await git(path, 'status', '--porcelain')).toBe(status);
  });
});
