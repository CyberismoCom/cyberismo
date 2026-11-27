// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';
import {
  CardNotFoundError,
  CycleError,
  DHValidationError,
  LogicInternalError,
  LogicInvalidError,
  LogicNonTotalError,
  LogicUnavailableError,
  ModuleRequestError,
  PermissionDeniedError,
  ReadOnlyContainerError,
  ResourceNotFoundError,
  WorkspaceDisposedError,
} from '@cyberismo/data-handler';
import { errorResponse } from '../src/common/errors.js';

describe('errorResponse', () => {
  it.each([
    [new DHValidationError('Index 1 is out of bounds'), 400, 'validation'],
    [new CardNotFoundError('card_1'), 404, 'not-found'],
    [new ResourceNotFoundError('mod/cardTypes/page'), 404, 'not-found'],
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

  it.each([
    [new LogicInvalidError('Logic failed'), 400, 'logic-invalid', undefined],
    [new LogicNonTotalError('Logic failed'), 422, 'logic-non-total', undefined],
    [
      new LogicUnavailableError('Logic failed'),
      503,
      'logic-unavailable',
      { 'Retry-After': '5' },
    ],
    [new LogicInternalError('Logic failed'), 500, 'logic-internal', undefined],
  ])('serves the logic failure %s as %i %s', (error, status, code, headers) => {
    const response = errorResponse(error);

    expect(response.status).toBe(status);
    expect(response.body).toMatchObject({ code });
    expect(response.headers).toEqual(headers);
  });

  it('keeps the diagnostics of an internal logic failure off the wire', () => {
    const diagnostics = [
      { severity: 'error' as const, message: 'in a stored program', key: 'p' },
    ];

    expect(
      errorResponse(new LogicInternalError('Logic failed', diagnostics)).body
        .details,
    ).toBe(undefined);
    expect(
      errorResponse(new LogicInvalidError('Logic failed', diagnostics)).body
        .details,
    ).toEqual({ diagnostics });
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
