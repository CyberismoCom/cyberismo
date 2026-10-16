// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { ConfigurationLogEntry } from '../../../../infra/replay-log/configuration-logger.js';
import type { Operation, MutationInput } from '@cyberismo/model';
import { resourceName } from '../../../../shared/utils/resource-utils.js';

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
    // The switch is exhaustive over ConfigurationOperation; this guards
    // callers that bypass plan-time seal validation (entries cast from
    // untyped JSON).
    default:
      throw new Error(
        `Unknown operation '${(entry as { operation: string }).operation}'`,
      );
  }
}
