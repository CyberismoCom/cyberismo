/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import type { MutationInput, MutationKind } from './types.js';
import type { ResourceName } from '../utils/resource-utils.js';
import type { ChangeOperation } from '../resources/resource-object.js';
import type { EnumDefinition } from '../interfaces/resource-interfaces.js';

export type RouteOp = 'add' | 'remove' | 'rank' | 'change' | 'rename-member';

export interface RouteKey {
  kind: MutationKind;
  type?: ResourceName['type']; // undefined for project_rename
  key?: string; // edits only
  op?: RouteOp; // edits only
}

// A 'change' on a collection that alters a member's IDENTITY is really a rename.
function isMemberRename(key: string, op: ChangeOperation<unknown>): boolean {
  if (key === 'enumValues')
    return (
      (op.target as EnumDefinition).enumValue !==
      (op.to as EnumDefinition).enumValue
    );
  if (key === 'states')
    return (op.target as { name?: string }).name !== (op.to as { name?: string }).name;
  return false;
}

export function route(input: MutationInput): RouteKey {
  if (input.kind === 'project_rename') return { kind: 'project_rename' };
  if (input.kind === 'rename') return { kind: 'rename', type: input.target.type };
  if (input.kind === 'delete') return { kind: 'delete', type: input.target.type };
  const { target, updateKey, operation } = input;
  const op: RouteOp =
    operation.name === 'change' &&
    isMemberRename(updateKey.key, operation as ChangeOperation<unknown>)
      ? 'rename-member'
      : (operation.name as RouteOp);
  return { kind: 'edit', type: target.type, key: updateKey.key, op };
}

export function routeKeyString(k: RouteKey): string {
  return `${k.kind}|${k.type ?? ''}|${k.key ?? ''}|${k.op ?? ''}`;
}
