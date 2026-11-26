// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, test } from 'vitest';
import { countResources } from '@/lib/resourceCounts';
import { RESOURCES } from '@/lib/constants';
import type { AnyNode } from '@/lib/api/types';

function resource(type: string, name: string, children: AnyNode[] = []) {
  return { id: name, type, name, children } as unknown as AnyNode;
}

// The backend marks imported modules read-only and names the project's own
// node "project".
function module(name: string, children: AnyNode[]) {
  return {
    id: `module-${name}`,
    type: 'module',
    name,
    prefix: name,
    children,
    readOnly: true,
  } as unknown as AnyNode;
}

function projectModule(children: AnyNode[]) {
  return {
    id: 'project',
    type: 'module',
    name: 'project',
    children,
    readOnly: false,
  } as unknown as AnyNode;
}

function group(name: string, children: AnyNode[]) {
  return {
    id: name,
    type: 'resourceGroup',
    name,
    children,
  } as unknown as AnyNode;
}

const tree: AnyNode[] = [
  {
    id: 'general-project',
    type: 'general',
    name: 'project',
  } as unknown as AnyNode,
  group('calculations', [
    projectModule([resource('calculations', 'bat/calculations/a')]),
    module('Base', [
      resource('calculations', 'base/calculations/b'),
      resource('calculations', 'base/calculations/c'),
    ]),
    module('Extra', [resource('calculations', 'extra/calculations/d')]),
  ]),
  group('templates', [
    projectModule([
      resource('templates', 'bat/templates/page', [
        resource('card', 'bat_1'),
        resource('card', 'bat_2'),
      ]),
    ]),
  ]),
  group('workflows', [
    module('project', [resource('workflows', 'imported/workflows/flow')]),
  ]),
];

describe('countResources', () => {
  test('splits the resources between the project and its modules', () => {
    expect(countResources(tree).calculations).toEqual({
      project: 1,
      modules: 3,
      moduleNames: ['Base', 'Extra'],
    });
  });

  test('counts an imported module named "project" as a module', () => {
    expect(countResources(tree).workflows).toEqual({
      project: 0,
      modules: 1,
      moduleNames: ['project'],
    });
  });

  test('counts a template once, not the cards in it', () => {
    expect(countResources(tree).templates).toEqual({
      project: 1,
      modules: 0,
      moduleNames: [],
    });
  });

  test('includes every resource type, also those the tree leaves out', () => {
    const counts = countResources(tree);
    expect(Object.keys(counts).sort()).toEqual([...RESOURCES].sort());
    expect(counts.skills).toEqual({ project: 0, modules: 0, moduleNames: [] });
  });

  test('returns zero counts for an empty tree', () => {
    const counts = countResources([]);
    for (const resourceType of RESOURCES) {
      expect(counts[resourceType].project + counts[resourceType].modules).toBe(
        0,
      );
    }
  });
});
