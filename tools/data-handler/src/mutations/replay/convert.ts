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

import type { ConfigurationLogEntry } from '../../utils/configuration-logger.js';
import type { MutationInput } from '../types.js';
import type { Operation } from '../../resources/resource-object.js';
import { resourceName } from '../../utils/resource-utils.js';

/** Reconstruct the MutationInput a released-format log entry records. */
export function entryToMutationInput(
  entry: ConfigurationLogEntry,
): MutationInput {
  switch (entry.operation) {
    case 'resource_update': {
      const key = entry.parameters?.key;
      const operation = entry.parameters?.operation;
      if (typeof key !== 'string' || operation === undefined) {
        throw new Error(
          `Malformed resource_update entry for '${entry.target}': missing key or operation`,
        );
      }
      // Operation passes through verbatim; handlers own shape tolerance.
      return {
        kind: 'edit',
        target: resourceName(entry.target),
        updateKey: { key },
        operation: operation as Operation<unknown>,
      };
    }
    case 'resource_delete':
      return { kind: 'delete', target: resourceName(entry.target) };
    case 'resource_rename': {
      const op = entry.parameters?.operation as { to?: string } | undefined;
      if (typeof op?.to !== 'string') {
        throw new Error(
          `Malformed resource_rename entry for '${entry.target}': missing operation.to`,
        );
      }
      return {
        kind: 'rename',
        target: resourceName(entry.target),
        newIdentifier: resourceName(op.to).identifier,
      };
    }
    case 'project_rename': {
      const oldPrefix = entry.parameters?.oldPrefix;
      const newPrefix = entry.parameters?.newPrefix;
      if (typeof oldPrefix !== 'string' || typeof newPrefix !== 'string') {
        throw new Error(
          `Malformed project_rename entry for '${entry.target}': missing oldPrefix or newPrefix`,
        );
      }
      return { kind: 'project_rename', newPrefix, oldPrefix };
    }
  }
}
