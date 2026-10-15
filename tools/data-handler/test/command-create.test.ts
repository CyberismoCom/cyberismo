// testing
import { expect, it, describe, beforeAll, afterAll } from 'vitest';

// node
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import type { Workspace } from '../src/api/workspace/workspace.js';
import { copyDir } from '../src/shared/utils/file-utils.js';
import { DefaultContent } from '../src/domain/resources/create-defaults.js';
import { checkoutOf } from '../src/infra/internal.js';
import { findCard } from '../src/domain/cards/read.js';
import { openTestWorkspace } from './helpers/open-test-workspace.js';

describe('create command', () => {
  it('access default parameters for template (success)', () => {
    const defaultContent = DefaultContent.template('testName');
    expect(defaultContent.displayName).toBe('');
    expect(defaultContent.category).toBe(undefined);
  });
  it('access default parameters for workflow (success)', () => {
    const defaultContent = DefaultContent.workflow('test');
    expect(defaultContent.name).toBe('test');
    expect(defaultContent.states.length).toBe(3);
    expect(defaultContent.transitions.length).toBe(3);
  });
  it('access default values for card (success)', () => {
    const defaultCardType = DefaultContent.cardType('test', 'testWorkflow');
    const defaultCard = DefaultContent.card(defaultCardType);
    expect(defaultCard.cardType).toBe('test');
    expect(defaultCard.rank).toBe('');
    expect(defaultCard.title).toBe('Untitled');
    expect(defaultCard.workflowState).toBe('');
  });
});

describe('created cards and custom field values', () => {
  const testRoot = join(import.meta.dirname, 'tmp-create-no-nulls-tests');
  const projectPath = join(testRoot, 'valid/decision-records');
  const templateName = 'decision/templates/decision';
  let ws: Workspace;

  beforeAll(async () => {
    mkdirSync(testRoot, { recursive: true });
    await copyDir('test/test-data/', testRoot);
    ws = await openTestWorkspace(projectPath, {});
  });

  afterAll(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  it('new cards do not contain null custom-field placeholders', async () => {
    const created = await ws.cards.create(templateName, undefined);
    const card = findCard(checkoutOf(ws), created[0].key);
    const nullCustomFieldKeys = (metadata: object) =>
      Object.entries(metadata)
        .filter(([key, value]) => value === null && key.includes('/'))
        .map(([key]) => key);

    expect(nullCustomFieldKeys(card.metadata!)).toEqual([]);

    const persisted = JSON.parse(
      readFileSync(join(card.path, 'index.json'), 'utf-8'),
    );
    expect(nullCustomFieldKeys(persisted)).toEqual([]);
  });

  it('cards added to a template get no null placeholders', async () => {
    // 'decision/cardTypes/decision' declares eight non-calculated custom fields;
    // the empty template keeps this out of the way of the tests below.
    const added = await ws.cards.addToTemplate(
      'decision/cardTypes/decision',
      'decision/templates/empty',
    );
    const card = findCard(checkoutOf(ws), added[0]);
    const customFieldKeys = Object.keys(card.metadata!).filter((key) =>
      key.includes('/'),
    );
    expect(customFieldKeys).toEqual([]);
  });

  it('reports a card the template does not hold as not part of it', async () => {
    await expect(
      ws.cards.addToTemplate(
        'decision/cardTypes/decision',
        'decision/templates/decision',
        'idontexist',
      ),
    ).rejects.toThrow("Card 'idontexist' is not part of template");
  });

  it('falsy template values survive instantiation', async () => {
    // Mutates the shared template card, so this test must stay last.
    const templateCards = checkoutOf(ws).templateTree(templateName).cards();
    const templateCard = templateCards.at(0)!;
    await ws.cards.editField(
      templateCard.key,
      'decision/fieldTypes/finished',
      false,
    );

    const created = await ws.cards.create(templateName, undefined);
    const card = findCard(checkoutOf(ws), created[0].key);
    expect(card.metadata!['decision/fieldTypes/finished']).toBe(false);
  });
});
