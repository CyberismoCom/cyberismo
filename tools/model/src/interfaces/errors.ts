/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2026

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/** What went wrong, as the app, CLI and MCP see it across the wire. */
export const ERROR_CODES = [
  'not-found',
  'read-only',
  'permission-denied',
  'cycle',
  'conflict',
  'validation',
  'container-mismatch',
  'schema-not-found',
  'module-request',
  'macro',
  'replay-failed',
  'workspace-disposed',
  'internal',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * An error response body. 'error' repeats 'message': the app reads 'error'.
 */
export interface ErrorBody {
  error: string;
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

/** The HTTP status each error code is served with. */
export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  'not-found': 404,
  'read-only': 403,
  'permission-denied': 403,
  cycle: 409,
  conflict: 409,
  validation: 400,
  'container-mismatch': 400,
  'schema-not-found': 500,
  'module-request': 500,
  macro: 500,
  'replay-failed': 500,
  'workspace-disposed': 500,
  internal: 500,
};
