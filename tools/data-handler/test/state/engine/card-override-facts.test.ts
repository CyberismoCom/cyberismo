// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { expect, it, describe, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

import { copyDir } from '../../../src/shared/utils/file-utils.js';
import { type Workspace } from '../../../src/api/workspace.js';
import { createCardFacts } from '../../../src/state/engine/clingo-facts.js';
import { resourceName } from '../../../src/shared/utils/resource-utils.js';
import type { Card, CardType } from '@cyberismo/model';
import { openTestWorkspace } from '../../helpers/open-test-workspace.js';
import { findCard } from '../../../src/domain/cards/read.js';
import { checkoutOf } from '../../../src/state/checkout/internal.js';

const FIELD = 'decision/fieldTypes/obsoletedBy';
const RESPONSIBLE_FIELD = 'decision/fieldTypes/responsible';
// Declared by the card type below, but no such fieldTypes resource exists.
const DANGLING_FIELD = 'decision/fieldTypes/deletedFieldType';

// Note: the fixture's only top-level card (decision_5) uses the
// "simplepage" card type, which has no custom fields at all. The
// "decision" card type (which already declares obsoletedBy as a
// calculated field) is instead used by decision_5's child card,
// decision_6 - so that card is used here instead of a top-level one.
const CARD_KEY = 'decision_6';

function calculationPath(projectPath: string) {
  return join(projectPath, '.cards/local/calculations/test/calculation.lp');
}

// Appends a calculation for FIELD, applying to every project card,
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
  let ws: Workspace;

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

    // Add a calculation for the same field, so the effective value
    // derivation (override wins over calculated) can be exercised too.
    appendFieldCalculatedRule(projectPath);

    ws = await openTestWorkspace(projectPath, {});
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('stored value on an override-enabled calculated field becomes fieldOverride', async () => {
    const card = findCard(checkoutOf(ws), CARD_KEY) as Card;
    const facts = await createCardFacts(card, checkoutOf(ws));
    expect(facts).toContain(
      `fieldOverride(${CARD_KEY}, "${FIELD}", "decision_999").`,
    );
    expect(facts).not.toContain(`field(${CARD_KEY}, "${FIELD}"`);
  });

  it('stored values on regular fields still become field facts', async () => {
    const card = findCard(checkoutOf(ws), CARD_KEY) as Card;
    const facts = await createCardFacts(card, checkoutOf(ws));
    expect(facts).toContain(`field(${CARD_KEY}, "title"`);
    expect(facts).not.toContain(`fieldOverride(${CARD_KEY}, "title"`);
  });

  it('card query: override wins as effective value; calculatedValue shows the calculated value', async () => {
    const result = await checkoutOf(ws).calculationEngine.runQuery(
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
  // against a fresh checkout to avoid polluting the tests above.
  it('conflicting scalar values raise a notification', async () => {
    const calcPath = calculationPath(projectPath);
    writeFileSync(
      calcPath,
      readFileSync(calcPath, 'utf-8') +
        `\nfield(Card, "${FIELD}", "conflicting") :- projectCard(Card).\n`,
    );

    const fresh = await openTestWorkspace(projectPath, {});
    const result = await checkoutOf(fresh).calculationEngine.runQuery(
      'card',
      'localApp',
      { cardKey: CARD_KEY },
    );
    const conflicts = result
      .at(0)!
      .notifications.filter((n) => n.title === 'Conflicting field values');
    // The ASP rule must not produce duplicate notifications for the same
    // conflicting field.
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].message).toContain(FIELD);
  });
});

describe('card query: calculated value without a stored override', () => {
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-override-noval-tests');
  const projectPath = join(testDir, 'valid/decision-records');
  let ws: Workspace;

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

    ws = await openTestWorkspace(projectPath, {});
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('calculated value is effective when no override is stored', async () => {
    const result = await checkoutOf(ws).calculationEngine.runQuery(
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
    const result = await checkoutOf(ws).calculationEngine.runQuery(
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
    const card = findCard(checkoutOf(ws), CARD_KEY) as Card;
    const facts = await createCardFacts(card, checkoutOf(ws));
    expect(facts).toContain(`field(${CARD_KEY}, "${RESPONSIBLE_FIELD}"`);
    expect(facts).not.toContain(
      `fieldOverride(${CARD_KEY}, "${RESPONSIBLE_FIELD}"`,
    );
  });

  // No card stores an override value for FIELD in this fixture, so disabling
  // its enableOverride flag must be allowed. Placed last: it mutates the
  // persisted card type, which would break the fixture assumptions above.
  it('disabling enableOverride succeeds when no card holds an override value', async () => {
    await expect(
      ws.changes.apply({
        kind: 'edit',
        target: resourceName('decision/cardTypes/decision'),
        updateKey: { key: 'customFields' },
        operation: {
          name: 'change',
          target: { name: FIELD, isCalculated: true, enableOverride: true },
          to: { name: FIELD, isCalculated: true },
        },
      }),
    ).resolves.toBeUndefined();

    const cardType = checkoutOf(ws)
      .resources.byType('decision/cardTypes/decision', 'cardTypes')
      .show() as CardType;
    const field = cardType.customFields.find((f) => f.name === FIELD);
    expect(field?.enableOverride).toBeFalsy();
  });
});

// The override-disable block was removed: disabling override on a calculated
// field that still holds stored values now succeeds (the values become
// dormant) instead of being refused.
describe('disabling override on a calculated field that holds values', () => {
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-override-disable-tests');
  const projectPath = join(testDir, 'valid/decision-records');
  let ws: Workspace;

  beforeAll(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);

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

    const cardJsonPath = join(
      projectPath,
      `cardRoot/decision_5/c/${CARD_KEY}/index.json`,
    );
    const metadata = JSON.parse(readFileSync(cardJsonPath, 'utf-8'));
    metadata[FIELD] = 'decision_999';
    writeFileSync(cardJsonPath, JSON.stringify(metadata, null, 4));

    ws = await openTestWorkspace(projectPath, {});
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('succeeds and persists instead of refusing on the stored values', async () => {
    await expect(
      ws.changes.apply({
        kind: 'edit',
        target: resourceName('decision/cardTypes/decision'),
        updateKey: { key: 'customFields' },
        operation: {
          name: 'change',
          target: { name: FIELD, isCalculated: true, enableOverride: true },
          to: { name: FIELD, isCalculated: true },
        },
      }),
    ).resolves.toBeUndefined();

    const cardType = checkoutOf(ws)
      .resources.byType('decision/cardTypes/decision', 'cardTypes')
      .show() as CardType;
    const field = cardType.customFields.find((f) => f.name === FIELD);
    expect(field?.isCalculated).toBe(true);
    expect(field?.enableOverride).toBeFalsy();
  });
});

// A stored value on a calculated, non-overridable field is stale (e.g. left
// after override was disabled). It must stay dormant so the calculation wins,
// rather than colliding with it as a "Conflicting field values" notification.
describe('stored value on a calculated non-overridable field is dormant', () => {
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-dormant-calculated-tests');
  const projectPath = join(testDir, 'valid/decision-records');
  let ws: Workspace;

  beforeAll(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);

    // The decision card type already declares FIELD calculated; leaving
    // enableOverride unset makes it calculated-but-not-overridable.
    const cardJsonPath = join(
      projectPath,
      `cardRoot/decision_5/c/${CARD_KEY}/index.json`,
    );
    const metadata = JSON.parse(readFileSync(cardJsonPath, 'utf-8'));
    metadata[FIELD] = 'decision_999';
    writeFileSync(cardJsonPath, JSON.stringify(metadata, null, 4));

    appendFieldCalculatedRule(projectPath);

    ws = await openTestWorkspace(projectPath, {});
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('the calculation is effective and no conflict is raised', async () => {
    const result = await checkoutOf(ws).calculationEngine.runQuery(
      'card',
      'localApp',
      { cardKey: CARD_KEY },
    );
    const card = result.at(0)!;
    const field = card.fields.find((f) => f.key === FIELD)!;
    expect(field.isOverridable).toBe(false);
    expect(field.value).toBe('decision_auto');
    expect(
      card.notifications.filter((n) => n.title === 'Conflicting field values'),
    ).toHaveLength(0);
  });
});

// Regression (INTDEV-1363): a card type may declare a custom field whose
// fieldTypes resource is gone - deleted, renamed or misspelled. Resolving it
// throws, and an unguarded lookup let a single such declaration abort fact
// generation for the whole project, so loading the project failed with
// a bare "Must define resource name to query its details" and 'validate' never
// got to report the dangling reference.
describe('a declared field whose field type resource is missing', () => {
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-dangling-field-type-tests');
  const projectPath = join(testDir, 'valid/decision-records');
  let ws: Workspace;

  beforeAll(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);

    const cardTypePath = join(
      projectPath,
      '.cards/local/cardTypes/decision.json',
    );
    const cardType = JSON.parse(readFileSync(cardTypePath, 'utf-8'));
    cardType.customFields.push({ name: DANGLING_FIELD });
    writeFileSync(cardTypePath, JSON.stringify(cardType, null, 4));

    const cardJsonPath = join(
      projectPath,
      `cardRoot/decision_5/c/${CARD_KEY}/index.json`,
    );
    const metadata = JSON.parse(readFileSync(cardJsonPath, 'utf-8'));
    metadata[DANGLING_FIELD] = 'stored value';
    writeFileSync(cardJsonPath, JSON.stringify(metadata, null, 4));

    ws = await openTestWorkspace(projectPath, {
      autoSaveConfiguration: false,
    });
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('is omitted while the rest of the card still produces facts', async () => {
    const card = findCard(checkoutOf(ws), CARD_KEY) as Card;

    const facts = await createCardFacts(card, checkoutOf(ws));

    expect(facts).toContain(`field(${CARD_KEY}, "title"`);
    expect(facts).not.toContain(DANGLING_FIELD);
  });
});

// Regression (INTDEV-1276): a fieldCalculated rule targeting a field whose
// card type does NOT declare it calculated must be ignored. Otherwise the
// calculation output and the card's stored value both become field() facts
// and collide, surfacing only as a cryptic "conflicting values" notification
// after the user edits and saves the field.
describe('fieldCalculated is ignored for a field the card type does not declare calculated', () => {
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-override-ignored-calc-tests');
  const projectPath = join(testDir, 'valid/decision-records');
  let ws: Workspace;

  beforeAll(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);

    // Mark the calculated field as NOT calculated in the card type, so it is
    // treated as an ordinary editable field.
    const cardTypePath = join(
      projectPath,
      '.cards/local/cardTypes/decision.json',
    );
    const cardType = JSON.parse(readFileSync(cardTypePath, 'utf-8'));
    const field = cardType.customFields.find(
      (f: { name: string }) => f.name === FIELD,
    );
    field.isCalculated = false;
    writeFileSync(cardTypePath, JSON.stringify(cardType, null, 4));

    // A calculation still produces a value for that same field...
    appendFieldCalculatedRule(projectPath);

    // ...and the user has stored a (different) value for it.
    const cardJsonPath = join(
      projectPath,
      `cardRoot/decision_5/c/${CARD_KEY}/index.json`,
    );
    const metadata = JSON.parse(readFileSync(cardJsonPath, 'utf-8'));
    metadata[FIELD] = 'decision_999';
    writeFileSync(cardJsonPath, JSON.stringify(metadata, null, 4));

    ws = await openTestWorkspace(projectPath, {});
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('the stored value stands alone and no conflict notification is raised', async () => {
    const result = await checkoutOf(ws).calculationEngine.runQuery(
      'card',
      'localApp',
      { cardKey: CARD_KEY },
    );
    const card = result.at(0)!;
    const field = card.fields.find((f) => f.key === FIELD)!;
    expect(field.isOverridable).toBe(false);
    expect(field.value).toBe('decision_999');
    expect(
      card.notifications.filter((n) => n.title === 'Conflicting field values'),
    ).toHaveLength(0);
  });
});
