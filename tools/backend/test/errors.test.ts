// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';
import {
  CardNotFoundError,
  CycleError,
  LogicError,
  ModuleRequestError,
  PermissionDeniedError,
  ReadOnlyContainerError,
  WorkspaceDisposedError,
} from '@cyberismo/data-handler';
import { errorResponse } from '../src/common/errors.js';

describe('errorResponse', () => {
  it.each([
    [new CardNotFoundError('card_1'), 404, 'not-found'],
    [new ReadOnlyContainerError('mod/templates/page'), 403, 'read-only'],
    [new PermissionDeniedError(['Card is locked']), 403, 'permission-denied'],
    [new CycleError('card_1'), 409, 'cycle'],
    [new WorkspaceDisposedError(), 503, 'workspace-disposed'],
  ])('serves %s as %i %s', (error, status, code) => {
    const response = errorResponse(error);

    expect(response.status).toBe(status);
    expect(response.body).toEqual({
      error: error.message,
      code,
      message: error.message,
      details: error.details,
    });
  });

  it('serves each kind of logic failure with its status', () => {
    const statuses = [
      ['invalid', 400, undefined],
      ['nonTotal', 422, undefined],
      ['unavailable', 503, '5'],
      ['internal', 500, undefined],
    ] as const;
    for (const [kind, status, retryAfter] of statuses) {
      const response = errorResponse(new LogicError(kind, 'Logic failed'));

      expect(response.status).toBe(status);
      expect(response.headers?.['Retry-After']).toBe(retryAfter);
      expect(response.body).toMatchObject({ code: 'logic', details: { kind } });
    }
  });

  it('keeps the diagnostics of an internal logic failure off the wire', () => {
    const diagnostics = [
      { severity: 'error' as const, message: 'in a stored program', key: 'p' },
    ];

    expect(
      errorResponse(new LogicError('internal', 'Logic failed', diagnostics))
        .body.details,
    ).toEqual({ kind: 'internal' });
    expect(
      errorResponse(new LogicError('invalid', 'Logic failed', diagnostics)).body
        .details,
    ).toEqual({ kind: 'invalid', diagnostics });
  });

  it("keeps a module request's git detail off the wire", () => {
    const error = new ModuleRequestError(
      "Couldn't fetch module: 'mod' is unreachable",
      'fatal: repository not found',
    );

    expect(errorResponse(error)).toEqual({
      status: 500,
      body: {
        error: error.message,
        code: 'module-request',
        message: error.message,
      },
    });
  });

  it('serves any other error as 500, whatever its Node error code', () => {
    const error = Object.assign(new Error('no such file'), { code: 'ENOENT' });

    expect(errorResponse(error)).toEqual({
      status: 500,
      body: {
        error: 'no such file',
        code: 'internal',
        message: 'no such file',
      },
    });
  });
});
