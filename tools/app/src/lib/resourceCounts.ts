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

/** The resource tree groups the project's own resources under this module name. */
export function isProjectModuleName(moduleName: string) {
  return moduleName.toLowerCase() === 'project';
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
      if (isProjectModuleName(module.name)) {
        count.project += resources;
      } else {
        count.modules += resources;
        count.moduleNames.push(module.name);
      }
    }
  }
  return counts;
}
