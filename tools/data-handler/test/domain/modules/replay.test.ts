// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ModuleReplayFailedError,
  ModuleValidationFailedError,
} from '../../../src/domain/resources/changes/replay/replay.js';
import { logLine, writeSeals } from '../../helpers/replay-fixtures.js';
import {
  editConfig,
  expectRefused,
  isInstalled,
  projects,
  sources,
} from './fixture.js';

const open = projects();
const source = sources();

const workflowOf = async (
  ws: Awaited<ReturnType<typeof seed>>['ws'],
  cardType: string,
) => ((await ws.resources.show(cardType)) as { workflow: string }).workflow;

// A project with module `lib` installed at 1.0.0 and a card type of its own
// using the module's workflow `flow`; `lib` is the source of the module.
async function seed() {
  const lib = await source({
    prefix: 'lib',
    version: '1.0.0',
    workflows: [{ name: 'flow' }, { name: 'plain' }],
    cardTypes: [{ name: 'page', workflow: 'flow' }],
    templates: [{ name: 'tpl', cards: [{}] }],
  });
  const project = await open();
  await project.ws.modules.install(lib);
  await project.ws.resources.create('test/cardTypes/consumer', 'cardTypes', {
    workflow: 'lib/workflows/flow',
  });
  return { ...project, lib };
}

const local = (lib: string, ...parts: string[]) =>
  join(lib, '.cards', 'local', ...parts);

// Turns the source into its 2.0.0 release, sealing the given log lines. A file
// source lists no versions, so the update names the release.
function release(lib: string, lines: string[]) {
  editConfig(lib, (config) => {
    config.version = '2.0.0';
  });
  writeSeals(local(lib, 'migrations'), [{ from: '1.0.0', to: '2.0.0', lines }]);
}

// The source renames its workflow `flow` to `moved`, as the release records.
function renameFlow(lib: string) {
  const file = local(lib, 'workflows', 'flow.json');
  const workflow = JSON.parse(readFileSync(file, 'utf-8'));
  writeFileSync(
    local(lib, 'workflows', 'moved.json'),
    JSON.stringify({ ...workflow, name: 'lib/workflows/moved' }),
  );
  rmSync(file);
  const cardType = local(lib, 'cardTypes', 'page.json');
  writeFileSync(
    cardType,
    JSON.stringify({
      ...JSON.parse(readFileSync(cardType, 'utf-8')),
      workflow: 'lib/workflows/moved',
    }),
  );
}

const rename = logLine('resource_rename', 'lib/workflows/flow', {
  type: 'workflows',
  operation: {
    name: 'change',
    target: 'lib/workflows/flow',
    to: 'lib/workflows/moved',
  },
});
const deleteFlow = logLine('resource_delete', 'lib/workflows/flow', {
  type: 'workflows',
});

describe('modules.update replaying what the release changed', () => {
  it('carries a rename into the project, reporting what it could not replay', async () => {
    const { ws, lib } = await seed();
    renameFlow(lib);
    release(lib, [
      rename,
      logLine('project_rename' as never, 'other'),
      logLine('resource_frobnicate' as never, 'lib/workflows/moved'),
    ]);

    const result = await ws.modules.update({ module: 'lib', version: '2.0.0' });

    expect(result).toEqual({
      replayed: [
        {
          modulePrefix: 'lib',
          fromVersion: '1.0.0',
          toVersion: '2.0.0',
          seals: 1,
          retired: ['project_rename'],
          unknown: ['resource_frobnicate'],
        },
      ],
      skippedReplays: [],
    });
    expect(await workflowOf(ws, 'test/cardTypes/consumer')).toBe(
      'lib/workflows/moved',
    );
    expect(await ws.resources.list('workflows')).toContain(
      'lib/workflows/moved',
    );
    expect(await ws.resources.list('workflows')).not.toContain(
      'lib/workflows/flow',
    );
  });

  it('removes what a deleted resource leaves unusable: the card type, and its cards', async () => {
    const { ws, lib } = await seed();
    await ws.resources.create('test/templates/seed', 'templates', {});
    await ws.cards.addToTemplate(
      'test/cardTypes/consumer',
      'test/templates/seed',
    );
    const created = await ws.cards.create('test/templates/seed');
    rmSync(local(lib, 'workflows', 'flow.json'));
    const page = local(lib, 'cardTypes', 'page.json');
    writeFileSync(
      page,
      JSON.stringify({
        ...JSON.parse(readFileSync(page, 'utf-8')),
        workflow: 'lib/workflows/plain',
      }),
    );
    release(lib, [deleteFlow]);

    await ws.modules.update({ module: 'lib', version: '2.0.0' });

    expect(await ws.resources.list('cardTypes')).not.toContain(
      'test/cardTypes/consumer',
    );
    expect(created.length).toBeGreaterThan(0);
    expect(created.map((card) => ws.cards.has(card.key))).toEqual(
      created.map(() => false),
    );
  });

  describe('stops', () => {
    it('before changing anything when the seals leave a gap', async () => {
      const { ws, path, lib } = await seed();
      editConfig(lib, (config) => {
        config.version = '2.0.0';
      });
      writeSeals(local(lib, 'migrations'), [
        { from: '1.5.0', to: '2.0.0', lines: [] },
      ]);

      await expectRefused(
        path,
        () => ws.modules.update({ module: 'lib', version: '2.0.0' }),
        /no migration path from installed 1\.0\.0 to 2\.0\.0/,
      );
    });

    it('when a seal entry cannot be replayed, saying what ran before it', async () => {
      const { ws, lib } = await seed();
      release(lib, [
        logLine('resource_rename', 'lib/workflows/flow', {
          type: 'workflows',
          operation: { name: 'change', target: 'lib/workflows/flow' },
        }),
      ]);

      const error = await ws.modules
        .update({ module: 'lib', version: '2.0.0' })
        .catch((caught) => caught);

      expect(error).toBeInstanceOf(ModuleReplayFailedError);
      expect(error.result).toEqual({ replayed: [], skippedReplays: [] });
    });

    // Pins today's behaviour: the new module files stay in place, the error
    // only tells the project no longer validates.
    it('when the release leaves the project invalid, with the new files in place', async () => {
      const { ws, path, lib } = await seed();
      // A card of the module's own card type, which the replay cannot repair.
      await ws.cards.create('lib/templates/tpl');
      rmSync(local(lib, 'workflows', 'flow.json'));
      release(lib, [deleteFlow]);

      const error = await ws.modules
        .update({ module: 'lib', version: '2.0.0' })
        .catch((caught) => caught);

      expect(error).toBeInstanceOf(ModuleValidationFailedError);
      expect(error.result.replayed).toHaveLength(1);
      expect(error.message).toContain('lib/workflows/flow');
      expect(isInstalled(path, 'lib')).toBe(true);
      expect(
        JSON.parse(
          readFileSync(
            join(path, '.cards', 'modules', 'lib', 'cardsConfig.json'),
            'utf-8',
          ),
        ).version,
      ).toBe('2.0.0');
    });
  });
});
