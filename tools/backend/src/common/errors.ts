// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { DomainError, LogicError } from '@cyberismo/data-handler';
import {
  ERROR_HTTP_STATUS,
  type ErrorBody,
  type ErrorCode,
} from '@cyberismo/model';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

// The status of each kind of logic failure.
const LOGIC_STATUS: Record<LogicError['kind'], ContentfulStatusCode> = {
  invalid: 400,
  nonTotal: 422,
  unavailable: 503,
  internal: 500,
};

// When to retry once the logic backend is unavailable: after its rebuild.
const LOGIC_RETRY_AFTER_SECONDS = '5';

/**
 * The HTTP response for an error that reached the edge. A DomainError's
 * domain 'code' picks the status, and a logic failure's kind; anything else
 * is a 500.
 */
export function errorResponse(error: Error): {
  status: ContentfulStatusCode;
  body: ErrorBody;
  headers?: Record<string, string>;
} {
  const message = error.message || 'Internal Server Error';
  if (error instanceof DomainError) {
    const unavailable =
      error instanceof LogicError && error.kind === 'unavailable';
    return {
      status:
        error instanceof LogicError
          ? LOGIC_STATUS[error.kind]
          : (ERROR_HTTP_STATUS[error.code] as ContentfulStatusCode),
      ...(unavailable && {
        headers: { 'Retry-After': LOGIC_RETRY_AFTER_SECONDS },
      }),
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
