/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import { expect, it, describe, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

import { copyDir } from '../../src/utils/file-utils.js';
import { CommandManager } from '../../src/command-manager.js';
import { createCardFacts } from '../../src/utils/clingo-facts.js';
import type { Card } from '../../src/index.js';

const FIELD = 'decision/fieldTypes/obsoletedBy';
const RESPONSIBLE_FIELD = 'decision/fieldTypes/responsible';

// Note: the fixture's only top-level card (decision_5) uses the
// "simplepage" card type, which has no custom fields at all. The
// "decision" card type (which already declares obsoletedBy as a
// calculated field) is instead used by decision_5's child card,
// decision_6 - so that card is used here instead of a top-level one.
const CARD_KEY = 'decision_6';

function calculationPath(projectPath: string) {
  return join(projectPath, '.cards/local/calculations/test/calculation.lp');
}

// Appends a designer calculation for FIELD, applying to every project card,
// so the "calculated value" half of the override/calculated resolution can
// be exercised alongside a stored override.
function appendFieldCalculatedRule(projectPath: string) {
  const calcPath = calculationPath(projectPath);
  writeFileSync(
    calcPath,
    readFileSync(calcPath, 'utf-8') +
      `\nfieldCalculated(Card, "${FIELD}", "decision_auto") :- projectCard(Card).\n`,
  );
}

describe('fieldOverride fact generation', () => {
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-override-facts-tests');
  const projectPath = join(testDir, 'valid/decision-records');
  let commands: CommandManager;

  beforeAll(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);

    // Enable override on the calculated field in the card type definition.
    const cardTypePath = join(
      projectPath,
      '.cards/local/cardTypes/decision.json',
    );
    const cardType = JSON.parse(readFileSync(cardTypePath, 'utf-8'));
    const field = cardType.customFields.find(
      (f: { name: string }) => f.name === FIELD,
    );
    field.enableOverride = true;
    writeFileSync(cardTypePath, JSON.stringify(cardType, null, 4));

    // Store an override value directly in a card's index.json.
    const cardJsonPath = join(
      projectPath,
      `cardRoot/decision_5/c/${CARD_KEY}/index.json`,
    );
    const metadata = JSON.parse(readFileSync(cardJsonPath, 'utf-8'));
    metadata[FIELD] = 'decision_999';
    writeFileSync(cardJsonPath, JSON.stringify(metadata, null, 4));

    // Add a designer calculation for the same field, so the effective value
    // derivation (override wins over calculated) can be exercised too.
    appendFieldCalculatedRule(projectPath);

    commands = new CommandManager(projectPath, {
      autoSaveConfiguration: false,
    });
    await commands.initialize();
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('stored value on an override-enabled calculated field becomes fieldOverride', async () => {
    const card = commands.project.findCard(CARD_KEY) as Card;
    const facts = await createCardFacts(card, commands.project);
    expect(facts).toContain(
      `fieldOverride(${CARD_KEY}, "${FIELD}", "decision_999").`,
    );
    expect(facts).not.toContain(`field(${CARD_KEY}, "${FIELD}"`);
  });

  it('stored values on regular fields still become field facts', async () => {
    const card = commands.project.findCard(CARD_KEY) as Card;
    const facts = await createCardFacts(card, commands.project);
    expect(facts).toContain(`field(${CARD_KEY}, "title"`);
    expect(facts).not.toContain(`fieldOverride(${CARD_KEY}, "title"`);
  });

  it('card query: override wins as effective value; calculatedValue shows the automatic value', async () => {
    const result = await commands.project.calculationEngine.runQuery(
      'card',
      'localApp',
      { cardKey: CARD_KEY },
    );
    const field = result.at(0)!.fields.find((f) => f.key === FIELD)!;
    expect(field.isOverridable).toBe(true);
    expect(field.value).toBe('decision_999');
    expect(field.overrideValue).toBe('decision_999');
    expect(field.calculatedValue).toBe('decision_auto');
  });

  // Mutates the fixture's calculation module further, so it runs last
  // against a fresh CommandManager to avoid polluting the tests above.
  it('conflicting scalar values raise a notification', async () => {
    const calcPath = calculationPath(projectPath);
    writeFileSync(
      calcPath,
      readFileSync(calcPath, 'utf-8') +
        `\nfield(Card, "${FIELD}", "conflicting") :- projectCard(Card).\n`,
    );

    const fresh = new CommandManager(projectPath, {
      autoSaveConfiguration: false,
    });
    await fresh.initialize();
    const result = await fresh.project.calculationEngine.runQuery(
      'card',
      'localApp',
      { cardKey: CARD_KEY },
    );
    const titles = result.at(0)!.notifications.map((n) => n.title);
    expect(titles).toContain('Conflicting field values');
  });
});

describe('card query: calculated value without a stored override', () => {
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-override-noval-tests');
  const projectPath = join(testDir, 'valid/decision-records');
  let commands: CommandManager;

  beforeAll(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);

    const cardTypePath = join(
      projectPath,
      '.cards/local/cardTypes/decision.json',
    );
    const cardType = JSON.parse(readFileSync(cardTypePath, 'utf-8'));
    const obsoletedByField = cardType.customFields.find(
      (f: { name: string }) => f.name === FIELD,
    );
    obsoletedByField.enableOverride = true;

    // Review point carried over from Task 2: enableOverride on a
    // non-calculated field must still emit plain field() facts, never
    // fieldOverride() - only isCalculated && enableOverride fields do.
    const responsibleField = cardType.customFields.find(
      (f: { name: string }) => f.name === RESPONSIBLE_FIELD,
    );
    responsibleField.enableOverride = true;
    writeFileSync(cardTypePath, JSON.stringify(cardType, null, 4));

    // Store a value for the non-calculated override-enabled field, but
    // deliberately leave FIELD (obsoletedBy) without a stored override.
    const cardJsonPath = join(
      projectPath,
      `cardRoot/decision_5/c/${CARD_KEY}/index.json`,
    );
    const metadata = JSON.parse(readFileSync(cardJsonPath, 'utf-8'));
    metadata[RESPONSIBLE_FIELD] = 'Jane Doe';
    writeFileSync(cardJsonPath, JSON.stringify(metadata, null, 4));

    appendFieldCalculatedRule(projectPath);

    commands = new CommandManager(projectPath, {
      autoSaveConfiguration: false,
    });
    await commands.initialize();
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('calculated value is effective when no override is stored', async () => {
    const result = await commands.project.calculationEngine.runQuery(
      'card',
      'localApp',
      { cardKey: CARD_KEY },
    );
    const field = result.at(0)!.fields.find((f) => f.key === FIELD)!;
    expect(field.isOverridable).toBe(true);
    expect(field.value).toBe('decision_auto');
    expect(field.calculatedValue).toBe('decision_auto');
    expect(field.overrideValue).toBeUndefined();
  });

  it('a field without overridableField reports isOverridable as false', async () => {
    const result = await commands.project.calculationEngine.runQuery(
      'card',
      'localApp',
      { cardKey: CARD_KEY },
    );
    const field = result
      .at(0)!
      .fields.find((f) => f.key === 'decision/fieldTypes/admins')!;
    expect(field).toBeDefined();
    expect(field.isOverridable).toBe(false);
  });

  it('stored value on an override-enabled but non-calculated field still becomes a field fact, not fieldOverride', async () => {
    const card = commands.project.findCard(CARD_KEY) as Card;
    const facts = await createCardFacts(card, commands.project);
    expect(facts).toContain(`field(${CARD_KEY}, "${RESPONSIBLE_FIELD}"`);
    expect(facts).not.toContain(
      `fieldOverride(${CARD_KEY}, "${RESPONSIBLE_FIELD}"`,
    );
  });
});
