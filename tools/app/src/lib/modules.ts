/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import type { UpdatePlan } from '@cyberismo/data-handler';
import type { ProjectModule } from './api/types';

export interface ModuleRow {
  // A transitive module is decided by the modules that require it.
  actions: { update: boolean; remove: boolean };
  managedBy?: string[];
  latestCompatible?: string;
  latestAvailable?: string;
  heldBack: boolean;
  upToDate: boolean;
  blocked: boolean;
}

// What a module row shows, given the joint update plan if one was fetched.
export function moduleRow(
  module: ProjectModule,
  plan?: UpdatePlan,
  all: ProjectModule[] = [],
): ModuleRow {
  const row: ModuleRow = {
    actions: { update: module.isRoot, remove: module.isRoot },
    heldBack: false,
    upToDate: false,
    blocked: plan?.ok === false,
  };
  if (!module.isRoot) {
    const nameOf = (prefix: string) =>
      all.find((m) => m.cardKeyPrefix === prefix)?.name ?? prefix;
    row.managedBy = module.parents.map(nameOf);
    return row;
  }
  if (!plan?.ok) return row;
  const change = plan.changes.find((c) => c.module === module.cardKeyPrefix);
  const root = plan.roots.find((r) => r.module === module.cardKeyPrefix);
  if (!root) return row;
  row.latestCompatible =
    change?.to ?? root.installed ?? module.installedVersion;
  row.latestAvailable = root.latest ?? undefined;
  row.heldBack = root.heldBack;
  row.upToDate = change === undefined;
  return row;
}
