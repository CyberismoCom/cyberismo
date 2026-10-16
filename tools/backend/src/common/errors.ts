// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { DomainError } from '@cyberismo/data-handler';
import {
  ERROR_HTTP_STATUS,
  type ErrorBody,
  type ErrorCode,
} from '@cyberismo/model';
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

/** The body of an error the edge decides itself. */
export function errorBody(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
): ErrorBody {
  return { error: message, code, message, ...(details && { details }) };
}
