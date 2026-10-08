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
  CardNotFoundError,
  InvalidResourceNameError,
  ResourceNotFoundError,
} from '@cyberismo/data-handler';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * Maps an error to an HTTP status code. Commands often wrap errors, so the
 * whole 'cause' chain is checked.
 * @param error Error to map.
 * @returns 400 for invalid input, 404 for missing cards and resources, otherwise 500
 */
export function errorStatus(error: unknown): ContentfulStatusCode {
  for (let current = error; current instanceof Error; current = current.cause) {
    if (current instanceof InvalidResourceNameError) {
      return 400;
    }
    if (
      current instanceof CardNotFoundError ||
      current instanceof ResourceNotFoundError
    ) {
      return 404;
    }
  }
  return 500;
}
