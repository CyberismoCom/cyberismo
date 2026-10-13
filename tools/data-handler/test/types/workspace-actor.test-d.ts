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

// Type test: checked by `tsc -p tsconfig.types.json`, never run.

import type { Checkout } from '../../src/containers/project.js';
import { Workspace } from '../../src/workspace/workspace.js';
import { SYSTEM_ACTOR } from '../../src/utils/tx-record.js';

type OverParameters = Parameters<typeof Workspace.over>;

// No Workspace can be obtained without an actor.
export const actorIsRequired: undefined extends OverParameters[1]
  ? never
  : true = true;

export function noWorkspaceWithoutAnActor(checkout: Checkout): unknown[] {
  return [
    // @ts-expect-error handles come only from Workspace.over
    new Workspace(checkout, SYSTEM_ACTOR, undefined),
    // @ts-expect-error the actor is required
    Workspace.over(checkout),
    // @ts-expect-error no actor-less singleton
    Workspace.getInstance('path'),
  ];
}
