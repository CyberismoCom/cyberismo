import { expect, describe, it } from 'vitest';

import { sep } from 'node:path';

import {
  buildCardHierarchy,
  cardPathParts,
  findParentPath,
  isExternalItemKey,
  isModuleCard,
  isTemplateCard,
  moduleNameFromCardKey,
  parentCard,
  sortCards,
} from '../../src/utils/card-utils.js';
import type { Card } from '../../src/interfaces/project-interfaces.js';

describe('card utils', () => {
  const moduleCard: Card = {
    key: 'mod_1',
    path: `.cards${sep}modules${sep}mod${sep}templates${sep}templateName${sep}c${sep}mod_1`,
    children: [],
    attachments: [],
    parent: 'root',
  };
  const templateCard: Card = {
    key: 'test_1',
    path: `.cards${sep}local${sep}templates${sep}templateName${sep}c${sep}test_1`,
    children: [],
    attachments: [],
    parent: 'root',
  };
  const projectCard: Card = {
    key: 'test_1',
    path: `cardRoot${sep}test_1`,
    children: ['test2'],
    attachments: [],
    parent: 'root',
  };
  const projectChildCard: Card = {
    key: 'test_2',
    path: `cardRoot${sep}test_1${sep}c${sep}test_2`,
    children: ['test_3'],
    attachments: [],
    parent: 'test_1',
  };
  const projectGrandChildCard: Card = {
    key: 'test_3',
    path: `cardRoot${sep}test_1${sep}c${sep}test_2${sep}c${sep}test_3`,
    children: [],
    attachments: [],
    parent: 'test_2',
  };

  const testCards = [projectCard, projectChildCard, projectGrandChildCard];

  it(' can build a card hierarchy with buildCardHierarchy', () => {
    const hierarchical = buildCardHierarchy(testCards);
    expect(hierarchical).toHaveLength(1);
    const root = hierarchical.at(0)!;
    expect(root.key).toBe('test_1');
    expect(root.children).toContain('test_2');
    expect(root.childrenCards).toHaveLength(1);

    const child = root.childrenCards.at(0)!;
    expect(child.key).toBe('test_2');
    expect(child.children).toContain('test_3');
    expect(child.childrenCards).toHaveLength(1);

    const grandchild = child.childrenCards.at(0)!;
    expect(grandchild.key).toBe('test_3');
    expect(grandchild.children).toHaveLength(0);
    expect(grandchild.childrenCards).toHaveLength(0);
  });

  describe('cardPathParts', () => {
    it('retrieves path parts for module cards', () => {
      const actual = cardPathParts('mod', moduleCard.path);
      expect(actual.cardKey).toBe(moduleCard.key);
      expect(actual.parents).toHaveLength(0);
      expect(actual.prefix).toBe('mod');
      expect(actual.template).toBe('mod/templates/templateName');
    });

    it('retrieves path parts for template cards', () => {
      const actual = cardPathParts('test', templateCard.path);
      expect(actual.cardKey).toBe(templateCard.key);
      expect(actual.parents).toHaveLength(0);
      expect(actual.prefix).toBe('test');
      expect(actual.template).toBe('test/templates/templateName');
    });

    it('retrieves path parts for project cards', () => {
      const actual = cardPathParts('test', projectCard.path);
      expect(actual.cardKey).toBe(projectCard.key);
      expect(actual.parents).toHaveLength(0);
      expect(actual.prefix).toBe('test');
      expect(actual.template).toBe('');
    });

    it('retrieves path parts for project child cards', () => {
      const actual = cardPathParts('test', projectChildCard.path);
      expect(actual.cardKey).toBe(projectChildCard.key);
      expect(actual.parents).toHaveLength(1);
      expect(actual.parents).toContain('test_1');
      expect(actual.prefix).toBe('test');
      expect(actual.template).toBe('');
    });

    it('retrieves path parts for project grandchild cards', () => {
      const actual = cardPathParts('test', projectGrandChildCard.path);
      expect(actual.cardKey).toBe(projectGrandChildCard.key);
      expect(actual.parents).toHaveLength(2);
      expect(actual.parents).toContain('test_1');
      expect(actual.parents).toContain('test_2');
      expect(actual.prefix).toBe('test');
      expect(actual.template).toBe('');
    });
  });

  describe('findParentPath', () => {
    it('finds parent path for child card', () => {
      const parentPath = findParentPath(projectChildCard.path);
      expect(parentPath).toBe(projectCard.path);
    });

    it('returns null if no parent path is found', () => {
      const parentPath = findParentPath(projectCard.path);
      expect(parentPath).toBeNull();
    });
  });

  it.each([
    [projectCard, false],
    [projectChildCard, false],
    [templateCard, false],
    [moduleCard, true],
  ])('isModuleCard validates module cards correctly', (card, expected) => {
    expect(isModuleCard(card)).toBe(expected);
  });

  it.each([
    [projectCard, false],
    [projectChildCard, false],
    [templateCard, true],
    [moduleCard, true],
  ])('isTemplateCard validates template cards correctly', (card, expected) => {
    expect(isTemplateCard(card)).toBe(expected);
  });

  it.each([
    [projectCard, 'test'],
    [projectChildCard, 'test'],
    [templateCard, 'test'],
    [moduleCard, 'mod'],
  ])(
    'moduleNameFromCardKey extracts module name correctly',
    (card, expected) => {
      expect(moduleNameFromCardKey(card.key)).toBe(expected);
    },
  );

  it.each([
    [projectCard, 'root'],
    [projectChildCard, 'test_1'],
    [templateCard, 'root'],
    [moduleCard, 'root'],
  ])('parentCard extracts parent card key correctly', (card, expected) => {
    expect(parentCard(card.path)).toBe(expected);
  });

  describe('sortCards', () => {
    it('sorts cards by key parts', () => {
      const cards = ['aaa_999', 'aaa_111', 'zzz_111', 'zzz_999', 'aaa_999'];
      cards.sort(sortCards);
      expect(cards.at(0)).toBe('aaa_111');
      expect(cards.at(1)).toBe('aaa_999');
      expect(cards.at(2)).toBe('aaa_999');
      expect(cards.at(3)).toBe('zzz_111');
      expect(cards.at(4)).toBe('zzz_999');
    });
  });

  it('isExternalItemKey', () => {
    expect(isExternalItemKey('jira:PROJ-123')).to.equal(true);
    expect(isExternalItemKey('connector:key')).to.equal(true);
    expect(isExternalItemKey('jira:PROJ:123')).to.equal(true);
    expect(isExternalItemKey('test_1')).to.equal(false);
    expect(isExternalItemKey('prefix_abc123')).to.equal(false);
    expect(isExternalItemKey('')).to.equal(false);
  });
});
