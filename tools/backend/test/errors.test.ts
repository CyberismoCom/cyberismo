// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';
import {
  CardNotFoundError,
  CycleError,
  LogicInternalError,
  LogicInvalidError,
  LogicNonTotalError,
  LogicUnavailableError,
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

  it.each([
    [new LogicInvalidError('Logic failed'), 400, 'logic-invalid'],
    [new LogicNonTotalError('Logic failed'), 422, 'logic-non-total'],
    [new LogicUnavailableError('Logic failed'), 503, 'logic-unavailable'],
    [new LogicInternalError('Logic failed'), 500, 'logic-internal'],
  ])('serves the logic failure %s as %i %s', (error, status, code) => {
    const response = errorResponse(error);

    expect(response.status).toBe(status);
    expect(response.body).toMatchObject({ code });
  });

  it('asks to retry an unavailable logic backend, and only that', () => {
    expect(
      errorResponse(new LogicUnavailableError('Logic failed')).headers,
    ).toEqual({ 'Retry-After': '5' });
    expect(errorResponse(new LogicInvalidError('Logic failed')).headers).toBe(
      undefined,
    );
    expect(errorResponse(new CardNotFoundError('card_1')).headers).toBe(
      undefined,
    );
  });

  it('keeps the diagnostics of an internal logic failure off the wire', () => {
    const diagnostics = [
      { severity: 'error' as const, message: 'in a stored program', key: 'p' },
    ];

    const internal = new LogicInternalError('Logic failed', diagnostics);

    expect(internal.diagnostics).toEqual(diagnostics);
    expect(errorResponse(internal).body.details).toBe(undefined);
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
