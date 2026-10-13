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

import {
  DomainError,
  type AllCommandOptions,
  type Workspace,
} from '@cyberismo/data-handler';
import type { ErrorCode } from '@cyberismo/model';

import { program } from './dispatch.js';
import { openWorkspace } from './open.js';

// Shown when a failure carries no message of its own.
export const GENERIC_FAILURE_MESSAGE = 'Command failed';

// The process exit code for each error code. Every failure exits 1 today.
const EXIT_CODES: Record<ErrorCode, number> = {
  'not-found': 1,
  'read-only': 1,
  'permission-denied': 1,
  cycle: 1,
  conflict: 1,
  validation: 1,
  'container-mismatch': 1,
  'schema-not-found': 1,
  'module-request': 1,
  macro: 1,
  'replay-failed': 1,
  'workspace-disposed': 1,
  internal: 1,
};

export function exitCodeFor(code: ErrorCode): number {
  return EXIT_CODES[code];
}

// Prints the message, or a generic one when it is empty, and exits.
export function fail(message: string | undefined, exitCode = 1): never {
  return program.error(message || GENERIC_FAILURE_MESSAGE, { exitCode });
}

// Fails with the exit code of the error's domain code.
export function failWith(error: unknown): never {
  if (error instanceof DomainError) {
    return fail(error.message, exitCodeFor(error.code));
  }
  return fail(error instanceof Error ? error.message : String(error));
}

// Runs an operation on the command's project; a failure exits with its code.
export async function onProject<T>(
  options: AllCommandOptions,
  operation: (ws: Workspace) => Promise<T>,
): Promise<T> {
  try {
    return await operation(await openWorkspace(options));
  } catch (error) {
    return failWith(error);
  }
}
