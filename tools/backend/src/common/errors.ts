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

import { DomainError } from '@cyberismo/data-handler';
import { ERROR_HTTP_STATUS, type ErrorBody } from '@cyberismo/model';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * The HTTP response for an error that reached the edge. Only a DomainError's
 * domain 'code' picks the status; anything else is a 500.
 */
export function errorResponse(error: Error): {
  status: ContentfulStatusCode;
  body: ErrorBody;
} {
  const message = error.message || 'Internal Server Error';
  if (error instanceof DomainError) {
    return {
      status: ERROR_HTTP_STATUS[error.code] as ContentfulStatusCode,
      body: {
        error: message,
        code: error.code,
        message,
        ...(error.details && { details: error.details }),
      },
    };
  }
  return {
    status: 500,
    body: { error: message, code: 'internal', message },
  };
}
