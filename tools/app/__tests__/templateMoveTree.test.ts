import { describe, expect, test } from 'vitest';
import {
  PROJECT_ROOT_KEY,
  TEMPLATE_PREFIX,
  buildProjectDestinationsTree,
  buildTemplateMoveTree,
  isProjectRootKey,
  isTemplateContainerKey,
} from '@/lib/templateMoveTree';
import type { AnyNode } from '@/lib/api/types';
import type { QueryResult } from '@cyberismo/data-handler/types/queries';

function cardNode(
  id: string,
  overrides: {
    title?: string;
    rank?: string;
    cardType?: string;
    children?: AnyNode[];
    noMetadata?: boolean;
  } = {},
): AnyNode {
  const data = overrides.noMetadata
    ? { key: id, path: '', children: [], attachments: [] }
    : {
        key: id,
        path: '',
        children: [],
        attachments: [],
        metadata: {
          title: overrides.title ?? `Title of ${id}`,
          rank: overrides.rank ?? '0|a',
          cardType: overrides.cardType ?? 'test/cardTypes/page',
          workflowState: 'Draft',
          links: [],
        },
      };
  return {
    id,
    type: 'card',
    name: `test/cards/${id}`,
    data,
    children: overrides.children ?? [],
  } as unknown as AnyNode;
}

function templatesNode(name: string, children: AnyNode[]): AnyNode {
  return {
    id: `templates-${name}`,
    type: 'templates',
    name,
    data: { name, displayName: name },
    children,
  } as unknown as AnyNode;
}

function moduleNode(
  name: string,
  children: AnyNode[],
  readOnly = false,
): AnyNode {
  return {
    id: `templates-module-${name}`,
    type: 'module',
    name,
    readOnly,
    children,
  } as unknown as AnyNode;
}

function templatesGroup(children: AnyNode[]): AnyNode {
  return {
    id: 'templates',
    type: 'resourceGroup',
    name: 'templates',
    children,
  } as unknown as AnyNode;
}

function localTree(templates: AnyNode[]): AnyNode[] {
  return [templatesGroup([moduleNode('project', templates, false)])];
}

describe('isTemplateContainerKey', () => {
  test('returns true for the synthetic template prefix', () => {
    expect(
      isTemplateContainerKey(`${TEMPLATE_PREFIX}test/templates/page`),
    ).toBe(true);
  });

  test('returns false for a regular card key', () => {
    expect(isTemplateContainerKey('test_aaa1')).toBe(false);
  });

  test('returns false for an empty string', () => {
    expect(isTemplateContainerKey('')).toBe(false);
  });

  test('returns false when the prefix is only a substring', () => {
    expect(isTemplateContainerKey('template__/x')).toBe(false);
  });
});

describe('isProjectRootKey', () => {
  test('returns true for the synthetic project-root key', () => {
    expect(isProjectRootKey(PROJECT_ROOT_KEY)).toBe(true);
  });

  test('returns false for anything else', () => {
    expect(isProjectRootKey('test_aaa1')).toBe(false);
    expect(isProjectRootKey('')).toBe(false);
    expect(isProjectRootKey(`${TEMPLATE_PREFIX}test/templates/page`)).toBe(
      false,
    );
  });
});

describe('buildTemplateMoveTree', () => {
  test('returns [] for null/undefined/empty resource tree', () => {
    expect(buildTemplateMoveTree(null)).toEqual([]);
    expect(buildTemplateMoveTree(undefined)).toEqual([]);
    expect(buildTemplateMoveTree([])).toEqual([]);
  });

  test('produces one synthetic root per local template, with cards as children', () => {
    const a = cardNode('test_aaa1', { title: 'Card A', rank: '0|a' });
    const b = cardNode('test_aaa2', { title: 'Card B', rank: '0|b' });
    const tree = localTree([templatesNode('test/templates/page', [a, b])]);

    const result = buildTemplateMoveTree(tree);

    expect(result).toHaveLength(1);
    expect(result[0].key).toBe(`${TEMPLATE_PREFIX}test/templates/page`);
    expect(result[0].title).toBe('test/templates/page');
    expect(result[0].cardType).toBe('');
    expect(result[0].rank).toBe('');
    expect(result[0].children).toEqual([
      {
        key: 'test_aaa1',
        rank: '0|a',
        title: 'Card A',
        cardType: 'test/cardTypes/page',
        children: [],
      },
      {
        key: 'test_aaa2',
        rank: '0|b',
        title: 'Card B',
        cardType: 'test/cardTypes/page',
        children: [],
      },
    ]);
  });

  test('preserves nested card hierarchy', () => {
    const grandchild = cardNode('gc', { title: 'GC' });
    const child = cardNode('c', { title: 'C', children: [grandchild] });
    const root = cardNode('r', { title: 'R', children: [child] });
    const tree = localTree([templatesNode('test/templates/page', [root])]);

    const result = buildTemplateMoveTree(tree);

    expect(result[0].children).toHaveLength(1);
    expect(result[0].children?.[0].key).toBe('r');
    expect(result[0].children?.[0].children?.[0].key).toBe('c');
    expect(result[0].children?.[0].children?.[0].children?.[0].key).toBe('gc');
  });

  test('skips non-card descendants under a templates node', () => {
    const card = cardNode('c1', { title: 'OK' });
    const bogus = {
      id: 'bogus',
      type: 'file',
      name: 'should not appear',
      children: [],
    } as unknown as AnyNode;
    const tree = localTree([
      templatesNode('test/templates/page', [card, bogus]),
    ]);

    const result = buildTemplateMoveTree(tree);

    expect(result[0].children).toHaveLength(1);
    expect(result[0].children?.[0].key).toBe('c1');
  });

  test('skips templates under readOnly (imported module) nodes', () => {
    const localCard = cardNode('local_a', { title: 'Local A' });
    const moduleCard = cardNode('eucra_x', { title: 'Eucra' });
    const tree: AnyNode[] = [
      templatesGroup([
        moduleNode('project', [
          templatesNode('local/templates/page', [localCard]),
        ]),
        moduleNode(
          'eucra',
          [templatesNode('eucra/templates/page', [moduleCard])],
          true,
        ),
      ]),
    ];

    const result = buildTemplateMoveTree(tree);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('local/templates/page');
    expect(result[0].children?.[0].key).toBe('local_a');
  });

  test('returns all local templates when there are several', () => {
    const a = cardNode('a', { title: 'A' });
    const b = cardNode('b', { title: 'B' });
    const tree = localTree([
      templatesNode('local/templates/one', [a]),
      templatesNode('local/templates/two', [b]),
    ]);

    const result = buildTemplateMoveTree(tree);

    expect(result.map((t) => t.title)).toEqual([
      'local/templates/one',
      'local/templates/two',
    ]);
    expect(result[0].children?.[0].key).toBe('a');
    expect(result[1].children?.[0].key).toBe('b');
  });
});

describe('buildProjectDestinationsTree', () => {
  const projectTree: QueryResult<'tree'>[] = [
    {
      key: 'proj_card_1',
      rank: '0|a',
      title: 'Project Card 1',
      cardType: 'test/cardTypes/page',
      children: [],
    },
    {
      key: 'proj_card_2',
      rank: '0|b',
      title: 'Project Card 2',
      cardType: 'test/cardTypes/page',
      children: [],
    },
  ];

  test('returns a single synthetic project-root node with project cards as children', () => {
    const result = buildProjectDestinationsTree(projectTree);

    expect(result).toHaveLength(1);
    expect(result[0].key).toBe(PROJECT_ROOT_KEY);
    expect(result[0].children).toHaveLength(2);
    expect(result[0].children?.[0].key).toBe('proj_card_1');
    expect(result[0].children?.[1].key).toBe('proj_card_2');
  });

  test('handles null/undefined project tree by returning an empty children list', () => {
    expect(buildProjectDestinationsTree(null)).toEqual([
      {
        key: PROJECT_ROOT_KEY,
        rank: '',
        title: PROJECT_ROOT_KEY,
        cardType: '',
        children: [],
      },
    ]);
    expect(buildProjectDestinationsTree(undefined)).toEqual([
      {
        key: PROJECT_ROOT_KEY,
        rank: '',
        title: PROJECT_ROOT_KEY,
        cardType: '',
        children: [],
      },
    ]);
  });
});
