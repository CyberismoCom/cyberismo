import { describe, expect, test } from 'vitest';
import { resolveConfigTreeMove } from '@/lib/configTreeMove';
import type { AnyNode } from '@/lib/api/types';

function cardNode(
  id: string,
  children: AnyNode[] = [],
  readOnly = false,
): AnyNode {
  return {
    id,
    type: 'card',
    name: `test/cards/${id}`,
    readOnly,
    data: {
      key: id,
      path: '',
      children: [],
      attachments: [],
      metadata: {
        title: id,
        rank: '0|a',
        cardType: 'test/cardTypes/page',
        workflowState: 'Draft',
        links: [],
      },
    },
    children,
  } as unknown as AnyNode;
}

function templatesNode(
  name: string,
  children: AnyNode[],
  readOnly = false,
): AnyNode {
  return {
    id: `templates-${name}`,
    type: 'templates',
    name,
    readOnly,
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

/**
 * Shape:
 *   templates resourceGroup
 *     project module (local, readOnly: false)
 *       templates: test/templates/page
 *         root1 (card)
 *           child1a
 *           child1b
 *         root2 (card)
 *       templates: test/templates/other
 *         otherRoot (card)
 *     eucra module (readOnly: true)
 *       templates: eucra/templates/page
 *         moduleRoot (card)
 */
function buildFixture(): AnyNode[] {
  const child1a = cardNode('child1a');
  const child1b = cardNode('child1b');
  const root1 = cardNode('root1', [child1a, child1b]);
  const root2 = cardNode('root2');
  const otherRoot = cardNode('otherRoot');
  const moduleRoot = cardNode('moduleRoot', [], true);
  return [
    {
      id: 'templates',
      type: 'resourceGroup',
      name: 'templates',
      children: [
        moduleNode(
          'project',
          [
            templatesNode('test/templates/page', [root1, root2]),
            templatesNode('test/templates/other', [otherRoot]),
          ],
          false,
        ),
        moduleNode(
          'eucra',
          [templatesNode('eucra/templates/page', [moduleRoot], true)],
          true,
        ),
      ],
    } as unknown as AnyNode,
  ];
}

const pageTemplateId = 'templates-test/templates/page';
const otherTemplateId = 'templates-test/templates/other';
const moduleTemplateId = 'templates-eucra/templates/page';

describe('resolveConfigTreeMove', () => {
  test('returns noop when the resource tree is missing', () => {
    expect(resolveConfigTreeMove(null, 'root1', pageTemplateId, 0)).toEqual({
      kind: 'noop',
    });
    expect(
      resolveConfigTreeMove(undefined, 'root1', pageTemplateId, 0),
    ).toEqual({ kind: 'noop' });
  });

  test('returns noop when the drag id is not found', () => {
    const tree = buildFixture();
    expect(resolveConfigTreeMove(tree, 'missing', pageTemplateId, 0)).toEqual({
      kind: 'noop',
    });
  });

  test('returns noop when the dragged node is not a card', () => {
    const tree = buildFixture();
    expect(
      resolveConfigTreeMove(tree, pageTemplateId, pageTemplateId, 0),
    ).toEqual({ kind: 'noop' });
  });

  test('rejects with invalidTarget when parentId is null', () => {
    const tree = buildFixture();
    expect(resolveConfigTreeMove(tree, 'root1', null, 0)).toEqual({
      kind: 'reject',
      reason: 'invalidTarget',
    });
  });

  test('rejects with invalidTarget when the parent is a resourceGroup or module', () => {
    const tree = buildFixture();
    expect(resolveConfigTreeMove(tree, 'root1', 'templates', 0)).toEqual({
      kind: 'reject',
      reason: 'invalidTarget',
    });
    expect(
      resolveConfigTreeMove(tree, 'root1', 'templates-module-project', 0),
    ).toEqual({
      kind: 'reject',
      reason: 'invalidTarget',
    });
  });

  test('rejects with moduleReadOnly when the dragged card is in an imported module', () => {
    const tree = buildFixture();
    expect(
      resolveConfigTreeMove(tree, 'moduleRoot', pageTemplateId, 0),
    ).toEqual({
      kind: 'reject',
      reason: 'moduleReadOnly',
    });
  });

  test('rejects with moduleReadOnly when the destination is in an imported module', () => {
    const tree = buildFixture();
    expect(resolveConfigTreeMove(tree, 'root1', moduleTemplateId, 0)).toEqual({
      kind: 'reject',
      reason: 'moduleReadOnly',
    });
    expect(resolveConfigTreeMove(tree, 'root1', 'moduleRoot', 0)).toEqual({
      kind: 'reject',
      reason: 'moduleReadOnly',
    });
  });

  test('updates with index only when reordering at the source template root', () => {
    const tree = buildFixture();
    expect(resolveConfigTreeMove(tree, 'root2', pageTemplateId, 0)).toEqual({
      kind: 'update',
      cardKey: 'root2',
      update: { index: 0 },
    });
  });

  test('updates with index only when reordering under the same card', () => {
    const tree = buildFixture();
    expect(resolveConfigTreeMove(tree, 'child1b', 'root1', 0)).toEqual({
      kind: 'update',
      cardKey: 'child1b',
      update: { index: 0 },
    });
  });

  test('updates with parent+index when moving from template root under a card', () => {
    const tree = buildFixture();
    expect(resolveConfigTreeMove(tree, 'root2', 'root1', 2)).toEqual({
      kind: 'update',
      cardKey: 'root2',
      update: { parent: 'root1', index: 2 },
    });
  });

  test('updates with parent+index when moving across parents within the same template', () => {
    const tree = buildFixture();
    expect(resolveConfigTreeMove(tree, 'child1a', 'root2', 0)).toEqual({
      kind: 'update',
      cardKey: 'child1a',
      update: { parent: 'root2', index: 0 },
    });
  });

  test('promotes a nested card to its own template root via drop on the source templates node', () => {
    const tree = buildFixture();
    expect(resolveConfigTreeMove(tree, 'child1a', pageTemplateId, 0)).toEqual({
      kind: 'update',
      cardKey: 'child1a',
      update: { parent: 'root', index: 0 },
    });
  });

  test('cross-template move under a card emits {parent: dest card, index}', () => {
    const tree = buildFixture();
    expect(resolveConfigTreeMove(tree, 'root1', 'otherRoot', 0)).toEqual({
      kind: 'update',
      cardKey: 'root1',
      update: { parent: 'otherRoot', index: 0 },
    });
  });

  test('cross-template drop on another local template node emits root:<name> sentinel', () => {
    const tree = buildFixture();
    expect(resolveConfigTreeMove(tree, 'root1', otherTemplateId, 0)).toEqual({
      kind: 'update',
      cardKey: 'root1',
      update: { parent: 'root:test/templates/other', index: 0 },
    });
  });
});
