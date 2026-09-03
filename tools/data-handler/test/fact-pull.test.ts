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

// testing
import { expect, it, describe, beforeEach, afterEach, vi } from 'vitest';

// node
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

import { CommandManager } from '../src/command-manager.js';
import { copyDir } from '../src/utils/file-utils.js';
import { resourceName } from '../src/utils/resource-utils.js';
import { getTestProject } from './helpers/test-utils.js';

// Facts are pulled before a solve rather than pushed after a write, so each
// case here writes without querying and then queries: it goes stale if the
// pull, or one of the invalidations that feed it, goes missing.
describe('facts are pulled before a solve', () => {
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-fact-pull-tests');
  const projectPath = join(testDir, 'valid/decision-records');
  let commands: CommandManager;

  // A project per test: what one write leaves behind is the point of these
  // cases, and a shared project would let an earlier test's query do the
  // projection this one is supposed to prove.
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    commands = new CommandManager(projectPath, {});
    await commands.initialize();
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  // What a query sees of a card, straight out of clingo.
  async function fieldOf(cardKey: string, field: string) {
    const result = await commands.project.calculationEngine.runLogicProgram(
      `result(Value) :- field(${cardKey}, "${field}", Value).`,
    );
    return result.results.map((item) => item.key);
  }

  async function cardKeys() {
    const result = await commands.project.calculationEngine.runLogicProgram(
      'result(Key) :- card(Key).',
    );
    return result.results.map((item) => item.key).sort();
  }

  it('does not lose the changes a failed pull drained', async () => {
    // Solve first, so the pull below takes the incremental path instead of
    // regenerating everything.
    await cardKeys();

    // A write straight to the tree: it marks the card without solving, so the
    // change is still pending when the failing pull drains it.
    const tree = commands.project.cardTree;
    const card = tree.card('decision_6');
    card.metadata!.title = 'Renamed';
    await tree.writeMetadata(card);

    // One failed per-card projection: setCardContent asks the project for the
    // card's tree, so the next such ask is the projection about to run.
    vi.spyOn(commands.project, 'treeOf').mockImplementationOnce(() => {
      throw new Error('projection failed');
    });

    await expect(fieldOf('decision_6', 'title')).rejects.toThrow(
      'projection failed',
    );
    // The change the failed pull took is not owed by anybody any more, so the
    // next solve has to rebuild rather than trust what it is holding.
    expect(await fieldOf('decision_6', 'title')).toEqual(['Renamed']);
  });

  it('sees a metadata edit made after the last solve', async () => {
    expect(await fieldOf('decision_6', 'title')).toEqual([
      'Document Decisions with Decision Records',
    ]);

    await commands.editCmd.editCardMetadata('decision_6', 'title', 'Renamed');

    expect(await fieldOf('decision_6', 'title')).toEqual(['Renamed']);
  });

  it('sees a card created after the last solve', async () => {
    const before = await cardKeys();

    const created = await commands.createCmd.createCard(
      'decision/templates/decision',
    );
    const createdKeys = created.map((card) => card.key).sort();
    expect(createdKeys.length).toBeGreaterThan(0);

    expect(await cardKeys()).toEqual([...before, ...createdKeys].sort());
  });

  it('stops seeing a card deleted after the last solve', async () => {
    const before = await cardKeys();
    expect(before).toContain('decision_6');

    await commands.removeCmd.remove('card', 'decision_6');

    expect(await cardKeys()).toEqual(
      before.filter((key) => key !== 'decision_6'),
    );
  });

  // An edit to a resource that already exists: nothing is added to or removed
  // from the resource cache, so the resource's own write is the only thing
  // that can report the change.
  it('sees an edit to an existing resource made after the last solve', async () => {
    await cardKeys();

    await commands.updateCmd.apply({
      kind: 'edit',
      target: resourceName('decision/workflows/simple'),
      updateKey: { key: 'displayName' },
      operation: {
        name: 'change',
        target: 'Simple workflow',
        to: 'Renamed workflow',
      },
    });

    const result = await commands.project.calculationEngine.runLogicProgram(
      'result(Name) :- field("decision/workflows/simple", "displayName", Name).',
    );
    expect(result.results.map((item) => item.key)).toEqual([
      'Renamed workflow',
    ]);
  });

  // Removing a resource takes it out of the resource cache; the resource
  // itself writes nothing, so the cache is the only thing that can report it.
  it('stops seeing a resource removed after the last solve', async () => {
    await commands.createCmd.createFieldType('doomedField', 'shortText');
    const fieldTypes = async () => {
      const result = await commands.project.calculationEngine.runLogicProgram(
        'result(Name) :- fieldType(Name).',
      );
      return result.results.map((item) => item.key);
    };
    expect(await fieldTypes()).toContain('decision/fieldTypes/doomedField');

    await commands.removeCmd.remove(
      'fieldType',
      'decision/fieldTypes/doomedField',
    );

    expect(await fieldTypes()).not.toContain('decision/fieldTypes/doomedField');
  });
});

// A calculation's logic program lives in a file next to the resource's
// metadata rather than in it, so writing it invalidates through a different
// path.
describe('a calculation rewritten after the last solve', () => {
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-fact-pull-calculation-tests');
  const projectPath = join(testDir, 'invalid/invalid-calculations');
  const validCalcName = 'mini/calculations/validCalc';

  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('is projected before the next solve', async () => {
    const project = getTestProject(projectPath);
    await project.populateCaches();

    const fact = async () => {
      const result = await project.calculationEngine.runLogicProgram(
        'result(X) :- validCalcFact(X).',
      );
      return result.results.map((item) => item.key);
    };
    expect(await fact()).toEqual(['42']);

    const calculation = project.resources.byType(validCalcName, 'calculations');
    await calculation.updateFile('calculation.lp', 'validCalcFact(43).');

    expect(await fact()).toEqual(['43']);
  });
});
