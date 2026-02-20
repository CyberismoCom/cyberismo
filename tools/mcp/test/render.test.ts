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
import {
  renderCard,
  getCardTree,
  type RenderedCard,
} from '../src/lib/render.js';
import { testDataPath } from './test-utils.js';

let commands: CommandManager;
let renderedCard: RenderedCard;

// Fixes weird issue with asciidoctor
beforeAll(async () => {
  process.argv = [];
  commands = await CommandManager.getInstance(testDataPath);
  renderedCard = await renderCard(commands, 'decision_5');
});

afterAll(async () => {
  commands.project.dispose();
});

describe('renderCard', () => {
  test('returns card with correct key and basic fields', () => {
    expect(renderedCard.key).toBe('decision_5');
    expect(renderedCard.title).toBeDefined();
    expect(renderedCard.cardType).toBeDefined();
    expect(renderedCard.cardTypeDisplayName).toBeDefined();
    expect(renderedCard.rawContent).toBeDefined();
    expect(renderedCard.parsedContent).toBeDefined();
  });

  test('includes workflow state and transitions', () => {
    expect(renderedCard.workflowState).toBeDefined();
    expect(Array.isArray(renderedCard.availableTransitions)).toBe(true);
    for (const transition of renderedCard.availableTransitions) {
      expect(transition.name).toBeDefined();
      expect(transition.toState).toBeDefined();
    }
  });

  test('includes fields with metadata', () => {
    expect(Array.isArray(renderedCard.fields)).toBe(true);
    for (const field of renderedCard.fields) {
      expect(field.key).toBeDefined();
      expect(field.dataType).toBeDefined();
      expect(typeof field.isCalculated).toBe('boolean');
      expect(typeof field.isEditable).toBe('boolean');
      expect(['always', 'optional']).toContain(field.visibility);
    }
  });

  test('includes denied operations with correct types', () => {
    expect(Array.isArray(renderedCard.deniedOperations.transitions)).toBe(true);
    expect(Array.isArray(renderedCard.deniedOperations.editFields)).toBe(true);
    expect(typeof renderedCard.deniedOperations.move).toBe('boolean');
    expect(typeof renderedCard.deniedOperations.delete).toBe('boolean');
    expect(typeof renderedCard.deniedOperations.editContent).toBe('boolean');
  });

  test('includes arrays for links, notifications, labels, children', () => {
    expect(Array.isArray(renderedCard.links)).toBe(true);
    expect(Array.isArray(renderedCard.notifications)).toBe(true);
    expect(Array.isArray(renderedCard.labels)).toBe(true);
    expect(Array.isArray(renderedCard.children)).toBe(true);
  });

  test('throws for invalid card key', async () => {
    await expect(renderCard(commands, 'invalid_key')).rejects.toThrow();
  });

  test('raw mode skips macro evaluation and transitions', async () => {
    const card = await renderCard(commands, 'decision_5', { raw: true });

    expect(card.key).toBe('decision_5');
    expect(card.rawContent).toBeDefined();
    // Raw mode should return empty transitions (no async work)
    expect(card.availableTransitions).toEqual([]);
  });
});

describe('getCardTree', () => {
  test('returns non-empty card tree with key and title', async () => {
    const tree = (await getCardTree(commands)) as Array<{
      key: string;
      title: string;
    }>;

    expect(Array.isArray(tree)).toBe(true);
    expect(tree.length).toBeGreaterThan(0);
    expect(tree[0].key).toBeDefined();
    expect(tree[0].title).toBeDefined();
  });
});
