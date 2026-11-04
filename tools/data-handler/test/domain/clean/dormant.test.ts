// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { execFile } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { promisify } from 'node:util';
import { describe, expect, it, vi } from 'vitest';

import { local, projects, snapshot } from '../resources/fixture.js';
import type { Workspace } from '../../../src/api/workspace.js';

const open = projects();

const f = (name: string) => `test/fieldTypes/${name}`;
// Card C1 holds a null placeholder, an empty string, a value no card type
// declares, a value on a locked calculated field and one on a calculated field
// that allows override.
const spec = {
  fieldTypes: [
    ...['size', 'spare', 'derived', 'over'].map((name) => ({
      name,
      dataType: 'integer',
    })),
    { name: 'note', dataType: 'shortText' },
  ],
  cardTypes: [
    {
      name: 'page',
      customFields: [
        { name: 'size' },
        { name: 'note' },
        { name: 'derived', isCalculated: true },
        { name: 'over', isCalculated: true, enableOverride: true },
      ],
    },
    { name: 'other', customFields: [{ name: 'size' }] },
  ],
  templates: [
    {
      name: 'tpl',
      cards: [{ fields: { [f('spare')]: 1 } }],
    },
  ],
  modules: [
    {
      prefix: 'mod',
      workflows: [{ name: 'flow' }],
      cardTypes: [{ name: 'page' }],
      templates: [{ name: 'mt', cards: [{ fields: { [f('spare')]: 9 } }] }],
    },
  ],
  cards: [
    { fields: { [f('size')]: 1 } },
    {
      fields: {
        [f('size')]: null,
        [f('note')]: '',
        [f('spare')]: 2,
        [f('derived')]: 5,
        [f('over')]: 6,
      },
    },
    { cardType: 'other', fields: { [f('spare')]: 3 } },
  ],
};

const metadata = async (ws: Workspace, key: string) =>
  (await ws.cards.details(key)).metadata!;

describe('clean.run', () => {
  it('reports what would go in a dry run, by card and reason, and writes nothing', async () => {
    const { ws, keys, path } = await open(spec);
    const before = snapshot(path);

    const result = await ws.clean.run(true);

    expect(result).toMatchObject({
      dryRun: true,
      failedCards: [],
      skippedCards: [],
    });
    const [templateCard] = readdirSync(
      local(path, 'templates', 'tpl', 'c'),
    ).filter((name) => name !== '.schema');
    expect(result.findings).toHaveLength(6);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        { cardKey: keys[1], field: f('size'), reason: 'null-value' },
        { cardKey: keys[1], field: f('note'), reason: 'null-value' },
        { cardKey: keys[1], field: f('spare'), reason: 'undeclared' },
        { cardKey: keys[1], field: f('derived'), reason: 'calculated-locked' },
        { cardKey: keys[2], field: f('spare'), reason: 'undeclared' },
        { cardKey: templateCard, field: f('spare'), reason: 'undeclared' },
      ]),
    );
    expect(result.cardCount).toBe(3);
    expect(snapshot(path)).toEqual(before);
  });

  it('removes them, keeping a calculated value that is allowed to override', async () => {
    const { ws, keys } = await open(spec);

    const result = await ws.clean.run(false);

    expect(result.dryRun).toBe(false);
    expect(await metadata(ws, keys[1])).not.toHaveProperty([f('size')]);
    expect(await metadata(ws, keys[1])).not.toHaveProperty([f('note')]);
    expect(await metadata(ws, keys[1])).not.toHaveProperty([f('spare')]);
    expect(await metadata(ws, keys[1])).not.toHaveProperty([f('derived')]);
    expect(await metadata(ws, keys[1])).toMatchObject({ [f('over')]: 6 });
    expect(await metadata(ws, keys[0])).toMatchObject({ [f('size')]: 1 });
    expect((await ws.clean.run(true)).findings).toEqual([]);
  });

  it('cleans the local template cards, and leaves module cards alone', async () => {
    const { ws, path, templateKeys } = await open(spec);
    const [moduleCard] = templateKeys['mod/templates/mt'];
    const before = snapshot(path);

    await ws.clean.run(false);

    const after = snapshot(path);
    const changed = Object.keys(after).filter(
      (file) => after[file] !== before[file],
    );
    expect(
      changed.some((file) =>
        file.includes(templateKeys['test/templates/tpl'][0]),
      ),
    ).toBe(true);
    expect(changed.some((file) => file.includes(moduleCard))).toBe(false);
  });

  it('is limited to the cards of one card type when it is given', async () => {
    const { ws, keys } = await open(spec);

    const result = await ws.clean.run(false, 'test/cardTypes/other');

    expect(result.findings).toEqual([
      { cardKey: keys[2], field: f('spare'), reason: 'undeclared' },
    ]);
    expect(await metadata(ws, keys[2])).not.toHaveProperty([f('spare')]);
    expect(await metadata(ws, keys[1])).toHaveProperty([f('spare')]);
  });

  it('is one commit under autocommit, and a dry run is none', async () => {
    const { ws, path } = await open(
      { ...spec, git: true },
      { autocommit: true },
    );
    const log = async () =>
      (
        await promisify(execFile)('git', ['log', '--format=%s'], { cwd: path })
      ).stdout
        .trim()
        .split('\n');
    const before = await log();

    await ws.clean.run(true);
    expect(await log()).toEqual(before);
    await ws.clean.run(false);

    expect(await log()).toEqual(['Remove dormant field values', ...before]);
  });
});

describe('clean.dormantSummary', () => {
  it('counts the dormant values and the cards that hold them', async () => {
    const { ws } = await open(spec);

    expect(await ws.clean.dormantSummary()).toEqual({
      valueCount: 6,
      cardCount: 3,
    });
    expect(await ws.clean.dormantSummary('test/cardTypes/other')).toEqual({
      valueCount: 1,
      cardCount: 1,
    });
  });

  it('is undefined when there are none', async () => {
    const { ws } = await open({ cards: [{}] });

    expect(await ws.clean.dormantSummary()).toBeUndefined();
  });

  it('is undefined, not a failure, when the scan fails', async () => {
    const { ws } = await open(spec);
    vi.spyOn(ws.clean, 'run').mockRejectedValue(new Error('scan failed'));

    expect(await ws.clean.dormantSummary()).toBeUndefined();
  });
});
