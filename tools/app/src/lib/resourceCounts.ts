// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { AnyNode } from './api/types';
import { RESOURCES, type ResourceName } from './constants';

/** How many resources of one type the project has, and how many its modules bring. */
export interface ResourceCount {
  project: number;
  modules: number;
  /** The modules that bring at least one resource of the type. */
  moduleNames: string[];
}

/**
 * Whether a module node of the resource tree holds the project's own
 * resources. The tree names that node "project", but an imported module can
 * have the same display name; only imported modules are read-only.
 */
export function isProjectModule(node: { name: string; readOnly?: boolean }) {
  return node.name === 'project' && !node.readOnly;
}

export function isResourceName(name: string): name is ResourceName {
  return (RESOURCES as readonly string[]).includes(name);
}

/**
 * Counts the resources of each type in the resource tree. Every type is in the
 * result, also when the tree leaves out its group because it has no resources.
 */
export function countResources(
  tree: AnyNode[],
): Record<ResourceName, ResourceCount> {
  const counts = {} as Record<ResourceName, ResourceCount>;
  for (const resource of RESOURCES) {
    counts[resource] = { project: 0, modules: 0, moduleNames: [] };
  }

  for (const group of tree) {
    if (group.type !== 'resourceGroup' || !isResourceName(group.name)) {
      continue;
    }
    const count = counts[group.name];
    for (const module of group.children ?? []) {
      if (module.type !== 'module') continue;
      // Templates hold their cards as children, so count only the resources.
      const resources = (module.children ?? []).filter(
        (node) => node.type === group.name,
      ).length;
      if (resources === 0) continue;
      if (isProjectModule(module)) {
        count.project += resources;
      } else {
        count.modules += resources;
        count.moduleNames.push(module.name);
      }
    }
  }
  return counts;
}
