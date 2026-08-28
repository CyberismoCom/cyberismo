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
import { expect, it, describe, beforeEach, afterEach } from 'vitest';

// node
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

import { CommandManager } from '../src/command-manager.js';
import { copyDir } from '../src/utils/file-utils.js';
import { resourceName } from '../src/utils/resource-utils.js';
import { getTestProject } from './helpers/test-utils.js';
import type { CardNode } from '../src/interfaces/project-interfaces.js';

// Nothing regenerates the logic program after a write any more: facts are
// pulled by whoever is about to solve. These are the cases that would go stale
// if the pull went missing - each one writes without querying, then queries.
describe('facts are pulled before a solve', () => {
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-fact-pull-tests');
  const projectPath = join(testDir, 'valid/decision-records');
  let commands: CommandManager;

  // A project per test: the point of these cases is what one write leaves
  // behind, and a shared project would let an earlier test's query do the
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

  // Draining is destructive, so a pull that throws part-way through has taken
  // changes it did not write. If it left the engine looking clean, every later
  // pull would take an empty change set and answer from stale programs - not
  // once, but for the rest of the process.
  it('does not lose the changes a failed pull drained', async () => {
    // Solve first, so the pull below takes the incremental path instead of
    // regenerating everything.
    await cardKeys();

    // A write straight to the tree: it marks the card without solving, so the
    // change is still pending when the failing pull drains it.
    const tree = commands.project.cardTree;
    const card = await tree.card('decision_6');
    card.metadata!.title = 'Renamed';
    await tree.writeMetadata(card);

    // One failed per-card projection, part-way through the batch.
    const projection = commands.project.calculationEngine as unknown as {
      setCardContent: (card: CardNode) => Promise<void>;
    };
    const setCardContent = projection.setCardContent;
    let failProjection = true;
    projection.setCardContent = async function (this: unknown, card: CardNode) {
      if (failProjection) {
        failProjection = false;
        throw new Error('projection failed');
      }
      return setCardContent.call(this, card);
    };

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

    const after = await cardKeys();
    expect(after).toEqual([...before, ...createdKeys].sort());
  });

  it('stops seeing a card deleted after the last solve', async () => {
    const before = await cardKeys();
    expect(before).toContain('decision_6');

    await commands.removeCmd.remove('card', 'decision_6');

    expect(await cardKeys()).toEqual(
      before.filter((key) => key !== 'decision_6'),
    );
  });

  it('sees a card moved after the last solve', async () => {
    const parentOf = async (cardKey: string) => {
      const result = await commands.project.calculationEngine.runLogicProgram(
        `result(Parent) :- parent(${cardKey}, Parent).`,
      );
      return result.results.map((item) => item.key);
    };
    expect(await parentOf('decision_6')).toEqual(['decision_5']);

    await commands.moveCmd.moveCard('decision_6', 'root');

    expect(await parentOf('decision_6')).toEqual([]);
  });

  // Resources are projected too, and a card's own facts depend on them: a
  // field the card type does not declare stays dormant.
  it('sees a resource change made after the last solve', async () => {
    // Forces the program to be built from the project as it is now, so the
    // change below has to reach clingo on its own.
    await cardKeys();

    await commands.createCmd.createFieldType('lateField', 'shortText');
    await commands.updateCmd.apply({
      kind: 'edit',
      target: resourceName('decision/cardTypes/decision'),
      updateKey: { key: 'customFields' },
      operation: {
        name: 'add',
        target: { name: 'decision/fieldTypes/lateField' },
      },
    });

    const result = await commands.project.calculationEngine.runLogicProgram(
      'result(Field) :- customField("decision/cardTypes/decision", Field).',
    );
    expect(result.results.map((item) => item.key)).toContain(
      'decision/fieldTypes/lateField',
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

  // The value only becomes a fact once the card type declares the field, so
  // this fails both when the card's facts go stale and when the card type's do.
  it('sees a value written to a field the card type has just gained', async () => {
    await commands.createCmd.createFieldType('lateField', 'shortText');
    await commands.updateCmd.apply({
      kind: 'edit',
      target: resourceName('decision/cardTypes/decision'),
      updateKey: { key: 'customFields' },
      operation: {
        name: 'add',
        target: { name: 'decision/fieldTypes/lateField' },
      },
    });
    await commands.editCmd.editCardMetadata(
      'decision_6',
      'decision/fieldTypes/lateField',
      'written late',
    );

    expect(
      await fieldOf('decision_6', 'decision/fieldTypes/lateField'),
    ).toEqual(['written late']);
  });
});

// A calculation's logic program is one of the programs the engine holds, and
// its content lives in a file next to the resource's metadata rather than in
// it, so writing it invalidates through a different path.
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
