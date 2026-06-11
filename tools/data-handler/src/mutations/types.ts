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

import type { Operation } from '../resources/resource-object.js';
import type { UpdateKey } from '../interfaces/resource-interfaces.js';
import type { ResourceName } from '../utils/resource-utils.js';

/** The four kinds of breaking change recorded in the migration log. */
export type MutationKind =
  | 'edit' // sub-property add/change/rank/remove
  | 'delete' // whole-resource delete
  | 'rename' // whole-resource rename
  | 'project_rename';

/** Discriminated input describing the change a maintainer wants to make. */
export type MutationInput =
  | {
      kind: 'edit';
      target: ResourceName;
      updateKey: UpdateKey<string>;
      operation: Operation<unknown>;
    }
  | { kind: 'delete'; target: ResourceName }
  | { kind: 'rename'; target: ResourceName; newIdentifier: string }
  | {
      kind: 'project_rename';
      newPrefix: string;
      /**
       * Set only when replaying a module's log entry: the module's previous
       * prefix. Authoring leaves it undefined (derived from the project).
       */
      oldPrefix?: string;
    };
