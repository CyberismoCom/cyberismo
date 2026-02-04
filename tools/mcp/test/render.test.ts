/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.

  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { CommandManager } from '@cyberismo/data-handler';
import { renderCard, getCardTree } from '../src/lib/render.js';
import { testDataPath } from './test-utils.js';

let commands: CommandManager;

// Fixes weird issue with asciidoctor
beforeAll(async () => {
  process.argv = [];
  commands = await CommandManager.getInstance(testDataPath);
});

afterAll(async () => {
  commands.project.dispose();
});

describe('renderCard', () => {
  test('renders a card with basic fields', async () => {
    const card = await renderCard(commands, 'decision_5');

    expect(card.key).toBe('decision_5');
    expect(card.title).toBeDefined();
    expect(card.cardType).toBeDefined();
    expect(card.rawContent).toBeDefined();
    expect(card.parsedContent).toBeDefined();
  });

  test('includes workflow state', async () => {
    const card = await renderCard(commands, 'decision_5');

    expect(card.workflowState).toBeDefined();
  });

  test('includes available transitions', async () => {
    const card = await renderCard(commands, 'decision_5');

    expect(Array.isArray(card.availableTransitions)).toBe(true);
    // Each transition should have name and toState
    for (const transition of card.availableTransitions) {
      expect(transition.name).toBeDefined();
      expect(transition.toState).toBeDefined();
    }
  });

  test('includes fields with metadata', async () => {
    const card = await renderCard(commands, 'decision_5');

    expect(Array.isArray(card.fields)).toBe(true);
    for (const field of card.fields) {
      expect(field.key).toBeDefined();
      expect(field.dataType).toBeDefined();
      expect(typeof field.isCalculated).toBe('boolean');
      expect(typeof field.isEditable).toBe('boolean');
      expect(['always', 'optional']).toContain(field.visibility);
    }
  });

  test('includes denied operations', async () => {
    const card = await renderCard(commands, 'decision_5');

    expect(card.deniedOperations).toBeDefined();
    expect(Array.isArray(card.deniedOperations.transitions)).toBe(true);
    expect(Array.isArray(card.deniedOperations.editFields)).toBe(true);
    expect(typeof card.deniedOperations.move).toBe('boolean');
    expect(typeof card.deniedOperations.delete).toBe('boolean');
    expect(typeof card.deniedOperations.editContent).toBe('boolean');
  });

  test('includes links array', async () => {
    const card = await renderCard(commands, 'decision_5');

    expect(Array.isArray(card.links)).toBe(true);
  });

  test('includes notifications array', async () => {
    const card = await renderCard(commands, 'decision_5');

    expect(Array.isArray(card.notifications)).toBe(true);
  });

  test('includes labels array', async () => {
    const card = await renderCard(commands, 'decision_5');

    expect(Array.isArray(card.labels)).toBe(true);
  });

  test('includes children array', async () => {
    const card = await renderCard(commands, 'decision_5');

    expect(Array.isArray(card.children)).toBe(true);
  });

  test('throws for invalid card key', async () => {
    await expect(renderCard(commands, 'invalid_key')).rejects.toThrow();
  });

  test('raw mode returns simpler data', async () => {
    const card = await renderCard(commands, 'decision_5', { raw: true });

    expect(card.key).toBe('decision_5');
    expect(card.rawContent).toBeDefined();
    // In raw mode, transitions may be empty since query is not run
    expect(Array.isArray(card.availableTransitions)).toBe(true);
  });
});

describe('getCardTree', () => {
  test('returns card tree', async () => {
    const tree = await getCardTree(commands);

    expect(tree).toBeDefined();
    expect(Array.isArray(tree)).toBe(true);
  });

  test('tree items have required fields', async () => {
    const tree = (await getCardTree(commands)) as Array<{
      key: string;
      title: string;
    }>;

    expect(tree.length).toBeGreaterThan(0);
    expect(tree[0].key).toBeDefined();
    expect(tree[0].title).toBeDefined();
  });
});
